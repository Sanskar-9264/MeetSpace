# Meetspace – Real-Time Communication App

A video conferencing + collaboration tool.

| Requirement | How it's built |
|---|---|
| Multi-user video calling | WebRTC full-mesh (up to 6 people), signaling over Socket.io |
| Screen sharing | `getDisplayMedia` + `RTCRtpSender.replaceTrack` (no renegotiation) |
| File sharing | Multer upload → AES-256-GCM encryption → disk; metadata in MongoDB; live "file added" event to the room |
| Whiteboard | HTML canvas, pen / eraser / text / colours / size, synced live, late joiners get the full board, PNG export |
| Data encryption | Media: WebRTC DTLS-SRTP. Files: AES-256-GCM at rest. Passwords: bcrypt (cost 12). Transport: use HTTPS/WSS in production |
| User authentication | Register/login with JWT (7 days). Socket.io and every REST route verify the token |

**Stack:** TypeScript · React 18 (Vite) · Tailwind CSS · Express.js · Node.js · MongoDB (Mongoose) · Socket.io · WebRTC

## Run it

You need Node 18+ and MongoDB (local, Atlas, or `docker compose up -d`).

```bash
npm run install:all      # installs root, server and client dependencies
npm run dev              # server on :5000, client on :5173
```

Open http://localhost:5173, create two accounts (use a second browser or a private window),
start a room in one, and paste the room link into the other.

`server/.env` is already filled with generated development secrets. For any real deployment,
copy `server/.env.example` and generate new values for `JWT_SECRET` and `FILE_ENCRYPTION_KEY`
(losing the file key makes stored files unreadable).

### Production

```bash
npm run build
NODE_ENV=production npm start   # Express serves API, sockets and the built React app on :5000
```

Put it behind HTTPS. Browsers only allow camera, microphone and screen capture on `https://` or `localhost`.

## How it works

```
Browser A ──┐                          ┌── Browser B
            │  signaling (Socket.io)   │
            └────────► Server ◄────────┘
                  offer / answer / ICE
Browser A ◄══════ WebRTC media (P2P, encrypted) ══════► Browser B
```

1. Signing in returns a JWT. The REST API reads it from `Authorization: Bearer`, Socket.io from the handshake.
2. `POST /api/rooms/:id/join` records membership. Chat, whiteboard, and files are only available to members.
3. When you enter a room, the server sends you the people already there. **You** send each of them an offer; they answer. This avoids both sides offering at once.
4. Camera/mic toggles flip `track.enabled` and broadcast a small state message so tiles show the muted icon or an avatar.
5. Screen share swaps the video track on every connection, and swaps back when you stop (or use the browser's own stop button).

## Project layout

```
server/src
  index.ts            Express app, security headers, rate limiting, static client
  socket.ts           Auth, rooms, signaling relay, chat, whiteboard sync
  routes/             auth.ts · rooms.ts · files.ts
  models/             User · Room · FileRecord
  utils/crypto.ts     AES-256-GCM helpers
client/src
  hooks/useRoom.ts    WebRTC peer management + media controls
  pages/              AuthPage · Dashboard · RoomPage
  components/         VideoTile · Whiteboard · ChatPanel · FilesPanel
```

## Known limits and next steps

- **Mesh topology** scales to roughly 4–6 people. For larger meetings, move to an SFU (mediasoup, LiveKit).
- **TURN server**: STUN alone fails on some corporate/mobile networks. Set `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS` in `client/.env` (see `.env.example`).
- Call media is encrypted hop-by-hop between browsers (DTLS-SRTP), not application-level end-to-end encrypted through a server. In mesh mode there is no server in the media path.
- Room chat and whiteboard state are kept in server memory (cleared when the room empties) and need a shared store (e.g. Redis) before running more than one server instance.
- The JWT is kept in `localStorage` for simplicity. For stricter XSS protection, move it to an httpOnly cookie.
- Files are limited to 25 MB (`MAX_FILE_MB`) and are held in memory during upload and encryption.
