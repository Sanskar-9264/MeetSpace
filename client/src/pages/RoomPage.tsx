import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, MessageSquare, Mic, MicOff, MonitorUp, MonitorX, Paperclip, PenLine, PhoneOff, Video, VideoOff } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useRoom } from '../hooks/useRoom';
import VideoTile from '../components/VideoTile';
import Whiteboard from '../components/Whiteboard';
import ChatPanel from '../components/ChatPanel';
import FilesPanel from '../components/FilesPanel';
import type { PeerInfo, RoomInfo } from '../types';

export default function RoomPage() {
  const { roomId = '' } = useParams();
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [error, setError] = useState('');

  // Joining over REST first records membership, which the socket and file APIs check.
  useEffect(() => {
    setRoom(null);
    api.post<RoomInfo>(`/rooms/${roomId}/join`).then(setRoom).catch((e: Error) => setError(e.message));
  }, [roomId]);

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="font-display text-xl font-bold">{error}</p>
          <Link to="/" className="btn-primary mt-4">Back to your rooms</Link>
        </div>
      </div>
    );
  }
  if (!room) return <div className="grid h-full place-items-center bg-night text-night-text">Joining room…</div>;
  return <RoomView room={room} />;
}

function RoomView({ room }: { room: RoomInfo }) {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const call = useRoom(room.roomId, token!);

  const [view, setView] = useState<'call' | 'board'>('call');
  const [side, setSide] = useState<'chat' | 'files' | null>('chat');
  const [copied, setCopied] = useState(false);

  const remote: PeerInfo[] = Object.values(call.peers);
  const total = remote.length + 1;
  const cols = total === 1 ? 'grid-cols-1 max-w-3xl' : total <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';

  const tiles = (compact: boolean) => (
    <>
      <VideoTile
        self
        compact={compact}
        name={user!.name}
        stream={call.screenStream ?? call.localStream}
        audioOn={call.audioOn}
        showVideo={call.videoOn || call.sharing}
        sharingScreen={call.sharing}
      />
      {remote.map((p) => (
        <VideoTile
          key={p.id}
          compact={compact}
          name={p.name}
          stream={p.stream}
          audioOn={p.audio}
          showVideo={(p.video || p.screen) && Boolean(p.stream)}
          sharingScreen={p.screen}
        />
      ))}
    </>
  );

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${room.roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const ctl = (active: boolean, danger = false) =>
    `rounded-full p-3.5 transition-colors ${
      danger ? 'bg-danger text-white hover:bg-danger/80' : active ? 'bg-cobalt text-white' : 'bg-night-line text-white hover:bg-night-line/70'
    }`;

  return (
    <div className="flex h-full flex-col bg-night text-white">
      <header className="flex items-center justify-between gap-3 border-b border-night-line px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold">{room.name}</h1>
          <p className="text-xs text-night-text/70">Room code {room.roomId}</p>
        </div>
        <button onClick={copyLink} className="btn border border-night-line text-night-text hover:bg-night-line">
          <Copy size={15} /> {copied ? 'Link copied' : 'Copy invite link'}
        </button>
      </header>

      {call.error && (
        <p role="alert" className="bg-danger/15 px-4 py-2 text-sm text-danger">{call.error}</p>
      )}
      {!call.hasCamera && !call.error && (
        <p className="bg-signal/15 px-4 py-2 text-sm text-signal">No camera found or access was blocked. You can still talk and share your screen.</p>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          {/* The whiteboard stays mounted so strokes keep arriving while you look at the call. */}
          <div className={view === 'board' ? 'flex flex-col gap-4' : 'hidden'}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{view === 'board' && tiles(true)}</div>
            <Whiteboard socket={call.socket} />
          </div>
          {view === 'call' && <div className={`mx-auto grid gap-3 ${cols}`}>{tiles(false)}</div>}
        </main>

        {side && (
          <aside className="fixed inset-y-0 right-0 z-20 w-full max-w-sm shrink-0 border-l border-night-line bg-night-raised md:static md:z-auto md:w-80 md:max-w-none">
            <div className="flex items-center border-b border-night-line text-sm font-semibold" role="tablist">
              {(['chat', 'files'] as const).map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={side === s}
                  onClick={() => setSide(s)}
                  className={`flex-1 px-4 py-3 ${side === s ? 'border-b-2 border-cobalt text-white' : 'text-night-text hover:text-white'}`}
                >
                  {s === 'chat' ? 'Chat' : 'Files'}
                </button>
              ))}
              <button onClick={() => setSide(null)} className="px-4 py-3 text-night-text hover:text-white md:hidden" aria-label="Close panel">
                Close
              </button>
            </div>
            <div className="h-[calc(100%-45px)]">
              {side === 'chat' ? (
                <ChatPanel messages={call.messages} meId={user!.id} onSend={call.sendChat} />
              ) : (
                <FilesPanel roomId={room.roomId} socket={call.socket} />
              )}
            </div>
          </aside>
        )}
      </div>

      <footer className="flex items-center justify-center gap-2 border-t border-night-line px-4 py-3 sm:gap-3">
        <button className={ctl(!call.audioOn)} onClick={call.toggleAudio} aria-label={call.audioOn ? 'Mute microphone' : 'Unmute microphone'} title={call.audioOn ? 'Mute' : 'Unmute'}>
          {call.audioOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button className={ctl(!call.videoOn)} onClick={call.toggleVideo} disabled={!call.hasCamera} aria-label={call.videoOn ? 'Turn camera off' : 'Turn camera on'} title={call.videoOn ? 'Camera off' : 'Camera on'}>
          {call.videoOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <button className={ctl(call.sharing)} onClick={() => void call.toggleScreen()} aria-label={call.sharing ? 'Stop sharing screen' : 'Share screen'} title={call.sharing ? 'Stop sharing' : 'Share screen'}>
          {call.sharing ? <MonitorX size={20} /> : <MonitorUp size={20} />}
        </button>
        <button className={ctl(view === 'board')} onClick={() => setView(view === 'board' ? 'call' : 'board')} aria-pressed={view === 'board'} aria-label="Whiteboard" title="Whiteboard">
          <PenLine size={20} />
        </button>
        <button className={ctl(side === 'chat')} onClick={() => setSide(side === 'chat' ? null : 'chat')} aria-label="Chat" title="Chat">
          <MessageSquare size={20} />
        </button>
        <button className={ctl(side === 'files')} onClick={() => setSide(side === 'files' ? null : 'files')} aria-label="Files" title="Files">
          <Paperclip size={20} />
        </button>
        <button className={ctl(false, true)} onClick={() => navigate('/')} aria-label="Leave room" title="Leave">
          <PhoneOff size={20} />
        </button>
      </footer>
    </div>
  );
}
