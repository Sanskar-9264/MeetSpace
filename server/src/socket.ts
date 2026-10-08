import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from './config';
import { Room } from './models/Room';
import { verifyToken } from './utils/jwt';

const MAX_PARTICIPANTS = 6; // full-mesh WebRTC: every pair has its own connection
const MAX_WB_ITEMS = 100_000;
const MAX_CHAT_HISTORY = 200;

interface Participant {
  id: string;
  userId: string;
  name: string;
  audio: boolean;
  video: boolean;
  screen: boolean;
}

type WbItem =
  | { t: 'line'; c: string; w: number; x0: number; y0: number; x1: number; y1: number }
  | { t: 'text'; c: string; s: number; x: number; y: number; text: string };

interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  ts: number;
}

interface RoomState {
  participants: Map<string, Participant>;
  board: WbItem[];
  chat: ChatMessage[];
}

// Room state lives in memory. Run a single server instance, or add the
// socket.io Redis adapter + a shared store to scale horizontally.
const rooms = new Map<string, RoomState>();

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const colour = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function sanitizeItem(raw: any): WbItem | null {
  if (!raw || typeof raw !== 'object' || !colour(raw.c)) return null;
  if (raw.t === 'line' && [raw.w, raw.x0, raw.y0, raw.x1, raw.y1].every(num)) {
    return { t: 'line', c: raw.c, w: Math.min(Math.max(raw.w, 1), 80), x0: raw.x0, y0: raw.y0, x1: raw.x1, y1: raw.y1 };
  }
  if (raw.t === 'text' && [raw.s, raw.x, raw.y].every(num) && typeof raw.text === 'string') {
    return { t: 'text', c: raw.c, s: Math.min(Math.max(raw.s, 8), 200), x: raw.x, y: raw.y, text: raw.text.slice(0, 500) };
  }
  return null;
}

export function attachSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.clientUrl, credentials: true },
    maxHttpBufferSize: 1e6,
  });

  // Reject connections without a valid login token.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const payload = verifyToken(token);
      socket.data.user = { id: payload.sub, name: payload.name };
      next();
    } catch {
      next(new Error('Not signed in'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as { id: string; name: string };
    let currentRoom: string | null = null;

    const state = () => (currentRoom ? rooms.get(currentRoom) : undefined);

    const leave = () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      socket.leave(currentRoom);
      if (room) {
        room.participants.delete(socket.id);
        socket.to(currentRoom).emit('peer:left', { id: socket.id });
        if (room.participants.size === 0) rooms.delete(currentRoom);
      }
      currentRoom = null;
    };

    socket.on('room:join', async (payload: { roomId?: string; audio?: boolean; video?: boolean }) => {
      try {
        const roomId = payload?.roomId;
        if (typeof roomId !== 'string' || currentRoom) return;

        const allowed = await Room.exists({ roomId, members: user.id });
        if (!allowed) return socket.emit('room:error', 'You are not a member of this room');

        const room = rooms.get(roomId) ?? { participants: new Map(), board: [], chat: [] };
        if (room.participants.size >= MAX_PARTICIPANTS) {
          return socket.emit('room:error', `This room is full (max ${MAX_PARTICIPANTS} people)`);
        }
        rooms.set(roomId, room);

        const me: Participant = {
          id: socket.id,
          userId: user.id,
          name: user.name,
          audio: payload.audio !== false,
          video: payload.video !== false,
          screen: false,
        };
        const others = [...room.participants.values()];
        room.participants.set(socket.id, me);
        currentRoom = roomId;
        socket.join(roomId);

        socket.emit('room:state', { self: socket.id, peers: others, messages: room.chat });
        socket.to(roomId).emit('peer:joined', me);
      } catch {
        socket.emit('room:error', 'Could not join the room');
      }
    });

    socket.on('room:leave', leave);

    // WebRTC signaling relay (offers, answers, ICE candidates).
    // Media itself flows peer-to-peer, DTLS-SRTP encrypted by the browser.
    socket.on('signal', (msg: { to?: string; data?: unknown }) => {
      const room = state();
      if (!room || typeof msg?.to !== 'string' || !room.participants.has(msg.to)) return;
      io.to(msg.to).emit('signal', { from: socket.id, data: msg.data });
    });

    socket.on('peer:state', (s: { audio?: boolean; video?: boolean; screen?: boolean }) => {
      const room = state();
      const me = room?.participants.get(socket.id);
      if (!room || !me || !currentRoom) return;
      me.audio = s?.audio === true;
      me.video = s?.video === true;
      me.screen = s?.screen === true;
      socket.to(currentRoom).emit('peer:state', { id: socket.id, audio: me.audio, video: me.video, screen: me.screen });
    });

    socket.on('chat:message', (msg: { text?: string }) => {
      const room = state();
      const text = typeof msg?.text === 'string' ? msg.text.trim().slice(0, 2000) : '';
      if (!room || !currentRoom || !text) return;
      const message: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: user.id,
        name: user.name,
        text,
        ts: Date.now(),
      };
      room.chat.push(message);
      if (room.chat.length > MAX_CHAT_HISTORY) room.chat.shift();
      io.to(currentRoom).emit('chat:message', message);
    });

    socket.on('whiteboard:sync', () => {
      const room = state();
      if (room) socket.emit('whiteboard:state', room.board);
    });

    socket.on('whiteboard:draw', (items: unknown) => {
      const room = state();
      if (!room || !currentRoom || !Array.isArray(items)) return;
      const clean = items.slice(0, 200).map(sanitizeItem).filter((i): i is WbItem => i !== null);
      if (!clean.length) return;
      if (room.board.length + clean.length <= MAX_WB_ITEMS) room.board.push(...clean);
      socket.to(currentRoom).emit('whiteboard:draw', clean);
    });

    socket.on('whiteboard:clear', () => {
      const room = state();
      if (!room || !currentRoom) return;
      room.board = [];
      socket.to(currentRoom).emit('whiteboard:clear');
    });

    socket.on('disconnect', leave);
  });

  return io;
}
