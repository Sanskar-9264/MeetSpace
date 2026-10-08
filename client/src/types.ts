export interface User {
  id: string;
  name: string;
  email: string;
}

export interface RoomInfo {
  roomId: string;
  name: string;
  createdAt: string;
  isOwner: boolean;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploader: string;
  createdAt: string;
}

export interface ChatMsg {
  id: string;
  userId: string;
  name: string;
  text: string;
  ts: number;
}

export interface PeerInfo {
  id: string; // socket id
  userId: string;
  name: string;
  audio: boolean;
  video: boolean;
  screen: boolean;
  stream?: MediaStream;
}

export type WbItem =
  | { t: 'line'; c: string; w: number; x0: number; y0: number; x1: number; y1: number }
  | { t: 'text'; c: string; s: number; x: number; y: number; text: string };
