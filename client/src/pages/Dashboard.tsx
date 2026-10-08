import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { RoomInfo } from '../types';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<RoomInfo[]>('/rooms').then(setRooms).catch(() => undefined);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const room = await api.post<RoomInfo>('/rooms', { name });
      navigate(`/room/${room.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the room');
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    // Accept either a bare code or a pasted room link.
    const id = code.trim().split('/').filter(Boolean).pop();
    if (id) navigate(`/room/${id}`);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <span className="font-display text-xl font-bold text-cobalt">Meetspace</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink/70">{user?.name}</span>
          <button className="btn-quiet !px-3 !py-2" onClick={logout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <h1 className="mt-14 font-display text-3xl font-bold">Hi {user?.name.split(' ')[0]}, who are you meeting?</h1>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <form onSubmit={create} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-line">
          <h2 className="font-display text-lg font-bold">Start a room</h2>
          <p className="mt-1 text-sm text-ink/60">You'll get a code to share with up to 5 other people.</p>
          <label htmlFor="room-name" className="mb-1.5 mt-4 block text-sm font-medium">Room name</label>
          <input id="room-name" className="input" placeholder="Design review" value={name} onChange={(e) => setName(e.target.value)} required />
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          <button className="btn-primary mt-4 w-full">Start room</button>
        </form>

        <form onSubmit={join} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-line">
          <h2 className="font-display text-lg font-bold">Join a room</h2>
          <p className="mt-1 text-sm text-ink/60">Paste the room code or link you were sent.</p>
          <label htmlFor="room-code" className="mb-1.5 mt-4 block text-sm font-medium">Room code</label>
          <input id="room-code" className="input" placeholder="a1b2c3-d4e5f6" value={code} onChange={(e) => setCode(e.target.value)} required />
          <button className="btn-quiet mt-4 w-full">Join room</button>
        </form>
      </div>

      <h2 className="mt-12 font-display text-lg font-bold">Your rooms</h2>
      {rooms.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">Rooms you start or join will show up here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          {rooms.map((r) => (
            <li key={r.roomId} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="text-xs text-ink/60">
                  {r.roomId} · {new Date(r.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Link to={`/room/${r.roomId}`} className="btn-quiet !py-1.5">Open</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
