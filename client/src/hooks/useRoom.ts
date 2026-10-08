import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { blankVideoTrack } from '../lib/media';
import type { ChatMsg, PeerInfo } from '../types';

const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
if (import.meta.env.VITE_TURN_URL) {
  iceServers.push({
    urls: import.meta.env.VITE_TURN_URL as string,
    username: import.meta.env.VITE_TURN_USER as string,
    credential: import.meta.env.VITE_TURN_PASS as string,
  });
}

interface RoomStatePayload {
  self: string;
  peers: PeerInfo[];
  messages: ChatMsg[];
}

/**
 * Owns the socket connection and one RTCPeerConnection per remote participant (full mesh).
 * The person who joins later makes the offers, so there are never two offers crossing.
 */
export function useRoom(roomId: string, token: string) {
  const socketRef = useRef<Socket | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const camStream = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const noCamera = useRef(false);
  const mediaState = useRef({ audio: true, video: true, screen: false });

  const [socket, setSocket] = useState<Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [hasCamera, setHasCamera] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const s = io({ auth: { token } });
    socketRef.current = s;
    setSocket(s);

    const upsert = (id: string, patch: Partial<PeerInfo>) =>
      setPeers((p) => ({
        ...p,
        [id]: {
          ...(p[id] ?? { id, userId: '', name: 'Guest', audio: true, video: true, screen: false }),
          ...patch,
        },
      }));

    const createPeer = (id: string) => {
      const pc = new RTCPeerConnection({ iceServers });
      pcs.current.set(id, pc);

      const local = camStream.current!;
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      if (!local.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });

      // If we're already sharing our screen, new joiners should see it, not the camera.
      const screenTrack = screenRef.current?.getVideoTracks()[0];
      if (screenTrack) {
        pc.getSenders().find((x) => x.track?.kind === 'video')?.replaceTrack(screenTrack);
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) s.emit('signal', { to: id, data: { candidate: e.candidate.toJSON() } });
      };
      pc.ontrack = (e) => {
        if (!pcs.current.has(id)) return;
        upsert(id, { stream: e.streams[0] ?? new MediaStream([e.track]) });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') pc.restartIce();
      };
      return pc;
    };

    const callPeer = async (id: string) => {
      const pc = createPeer(id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      s.emit('signal', { to: id, data: { sdp: pc.localDescription!.toJSON() } });
    };

    s.on('room:state', (st: RoomStatePayload) => {
      setMessages(st.messages);
      setPeers(Object.fromEntries(st.peers.map((p) => [p.id, p])));
      st.peers.forEach((p) => void callPeer(p.id));
    });

    s.on('peer:joined', (p: PeerInfo) => upsert(p.id, p));

    s.on('peer:left', ({ id }: { id: string }) => {
      pcs.current.get(id)?.close();
      pcs.current.delete(id);
      pendingIce.current.delete(id);
      setPeers((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    });

    s.on('peer:state', ({ id, audio, video, screen }: Pick<PeerInfo, 'id' | 'audio' | 'video' | 'screen'>) =>
      upsert(id, { audio, video, screen }),
    );

    s.on('chat:message', (m: ChatMsg) => setMessages((x) => [...x, m]));
    s.on('room:error', (message: string) => setError(message));
    s.on('connect_error', (err: Error) => setError(err.message));
    s.on('disconnect', () => {
      if (!cancelled) setError('Connection lost. Reload the page to rejoin.');
    });

    s.on('signal', async ({ from, data }: { from: string; data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      try {
        const pc = pcs.current.get(from) ?? createPeer(from);
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          const queued = pendingIce.current.get(from) ?? [];
          pendingIce.current.delete(from);
          for (const c of queued) await pc.addIceCandidate(c);
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            s.emit('signal', { to: from, data: { sdp: pc.localDescription!.toJSON() } });
          }
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
          else pendingIce.current.set(from, [...(pendingIce.current.get(from) ?? []), data.candidate]);
        }
      } catch (err) {
        console.warn('Signaling error', err);
      }
    });

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          stream = new MediaStream();
        }
      }
      if (!stream.getVideoTracks().length) {
        stream.addTrack(blankVideoTrack());
        noCamera.current = true;
        mediaState.current.video = false;
        setHasCamera(false);
        setVideoOn(false);
      }
      if (!stream.getAudioTracks().length) {
        mediaState.current.audio = false;
        setAudioOn(false);
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      camStream.current = stream;
      setLocalStream(stream);
      s.emit('room:join', { roomId, audio: mediaState.current.audio, video: mediaState.current.video });
    })();

    const peerConnections = pcs.current;
    return () => {
      cancelled = true;
      s.emit('room:leave');
      s.disconnect();
      peerConnections.forEach((pc) => pc.close());
      peerConnections.clear();
      camStream.current?.getTracks().forEach((t) => t.stop());
      screenRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current = null;
    };
  }, [roomId, token]);

  const broadcastState = () => socketRef.current?.emit('peer:state', mediaState.current);

  const toggleAudio = useCallback(() => {
    const track = camStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    mediaState.current.audio = track.enabled;
    setAudioOn(track.enabled);
    broadcastState();
  }, []);

  const toggleVideo = useCallback(() => {
    const track = camStream.current?.getVideoTracks()[0];
    if (!track || noCamera.current) return;
    track.enabled = !track.enabled;
    mediaState.current.video = track.enabled;
    setVideoOn(track.enabled);
    broadcastState();
  }, []);

  const stopScreen = useCallback(() => {
    const screen = screenRef.current;
    if (!screen) return;
    screen.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    setScreenStream(null);
    const cam = camStream.current?.getVideoTracks()[0];
    if (cam) pcs.current.forEach((pc) => pc.getSenders().find((x) => x.track?.kind === 'video')?.replaceTrack(cam));
    mediaState.current.screen = false;
    broadcastState();
  }, []);

  const toggleScreen = useCallback(async () => {
    if (screenRef.current) return stopScreen();
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screen.getVideoTracks()[0];
      track.onended = stopScreen; // browser's own "Stop sharing" button
      pcs.current.forEach((pc) => pc.getSenders().find((x) => x.track?.kind === 'video')?.replaceTrack(track));
      screenRef.current = screen;
      setScreenStream(screen);
      mediaState.current.screen = true;
      broadcastState();
    } catch {
      /* person dismissed the picker */
    }
  }, [stopScreen]);

  const sendChat = useCallback((text: string) => socketRef.current?.emit('chat:message', { text }), []);

  return {
    socket,
    localStream,
    screenStream,
    peers,
    messages,
    audioOn,
    videoOn,
    hasCamera,
    sharing: Boolean(screenStream),
    error,
    toggleAudio,
    toggleVideo,
    toggleScreen,
    sendChat,
  };
}
