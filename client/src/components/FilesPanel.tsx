import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Upload } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { formatBytes } from '../lib/media';
import type { FileItem } from '../types';

interface Props {
  roomId: string;
  socket: Socket | null;
}

export default function FilesPanel({ roomId, socket }: Props) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<FileItem[]>(`/files/${roomId}`).then(setFiles).catch((e: Error) => setError(e.message));
  }, [roomId]);

  useEffect(() => {
    if (!socket) return;
    const onAdded = (f: FileItem) => setFiles((prev) => (prev.some((x) => x.id === f.id) ? prev : [f, ...prev]));
    socket.on('file:added', onAdded);
    return () => {
      socket.off('file:added', onAdded);
    };
  }, [socket]);

  const upload = useCallback(
    async (file: File) => {
      setError('');
      setBusy(true);
      try {
        await api.upload<FileItem>(`/files/${roomId}`, file); // the server broadcasts it back to everyone
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setBusy(false);
      }
    },
    [roomId],
  );

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void upload(f);
    e.target.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  };

  return (
    <div className="flex h-full flex-col" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="p-4">
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className={`flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-sm transition-colors ${
            dragging ? 'border-cobalt bg-cobalt/10 text-white' : 'border-night-line text-night-text hover:border-cobalt'
          }`}
        >
          <Upload size={20} />
          <span className="font-semibold">{busy ? 'Encrypting and uploading…' : 'Drop a file or click to choose'}</span>
          <span className="text-xs text-night-text/60">Stored encrypted. Visible only to people in this room.</span>
        </button>
        <input ref={input} type="file" className="hidden" onChange={onPick} />
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {files.length === 0 && <li className="text-sm text-night-text/70">Nothing shared yet.</li>}
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-lg bg-night-line/60 px-3 py-2.5">
            <FileText size={18} className="shrink-0 text-night-text" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{f.name}</p>
              <p className="text-xs text-night-text/70">
                {formatBytes(f.size)} · {f.uploader}
              </p>
            </div>
            <button
              className="rounded-md p-2 text-night-text hover:bg-night hover:text-white"
              aria-label={`Download ${f.name}`}
              onClick={() => api.download(f.id, f.name).catch((e: Error) => setError(e.message))}
            >
              <Download size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
