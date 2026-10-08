import { KeyboardEvent, PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eraser, PenLine, Trash2, Type } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import type { WbItem } from '../types';

type Tool = 'pen' | 'eraser' | 'text';

const COLORS = ['#14202B', '#E5484D', '#F2B01E', '#2FA36B', '#2F5BEA', '#8E4EC6'];
const PAPER = '#FFFFFF';

/** Items use coordinates normalized to 0..1 and sizes relative to a 1000px-wide board, so every screen size matches. */
function paint(ctx: CanvasRenderingContext2D, item: WbItem, w: number, h: number) {
  const k = w / 1000;
  if (item.t === 'line') {
    ctx.strokeStyle = item.c;
    ctx.lineWidth = item.w * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(item.x0 * w, item.y0 * h);
    ctx.lineTo(item.x1 * w, item.y1 * h);
    ctx.stroke();
  } else {
    ctx.fillStyle = item.c;
    ctx.font = `600 ${item.s * k}px Figtree, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(item.text, item.x * w, item.y * h);
  }
}

export default function Whiteboard({ socket }: { socket: Socket | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const items = useRef<WbItem[]>([]);
  const size = useRef({ w: 0, h: 0 });
  const last = useRef<{ x: number; y: number } | null>(null);
  const outbox = useRef<WbItem[]>([]);
  const raf = useRef(0);
  const textDone = useRef(true);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  const redraw = useCallback(() => {
    const c = ctx();
    const { w, h } = size.current;
    if (!c || !w) return;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);
    items.current.forEach((i) => paint(c, i, w, h));
  }, []);

  // Keep the canvas sharp and 16:9 whenever its container resizes (including when it becomes visible).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const observer = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      if (!w) return;
      const h = Math.round((w * 9) / 16);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
      size.current = { w, h };
      redraw();
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    if (!socket) return;
    const onState = (all: WbItem[]) => {
      items.current = all;
      redraw();
    };
    const onDraw = (batch: WbItem[]) => {
      const c = ctx();
      const { w, h } = size.current;
      items.current.push(...batch);
      if (c && w) batch.forEach((i) => paint(c, i, w, h));
    };
    const onClear = () => {
      items.current = [];
      redraw();
    };
    socket.on('whiteboard:state', onState);
    socket.on('whiteboard:draw', onDraw);
    socket.on('whiteboard:clear', onClear);
    socket.emit('whiteboard:sync');
    return () => {
      socket.off('whiteboard:state', onState);
      socket.off('whiteboard:draw', onDraw);
      socket.off('whiteboard:clear', onClear);
    };
  }, [socket, redraw]);

  // Batch outgoing strokes to one socket message per animation frame.
  const send = (item: WbItem) => {
    outbox.current.push(item);
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      socket?.emit('whiteboard:draw', outbox.current);
      outbox.current = [];
    });
  };

  const add = (item: WbItem) => {
    items.current.push(item);
    const c = ctx();
    if (c) paint(c, item, size.current.w, size.current.h);
    send(item);
  };

  const pos = (e: PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const onDown = (e: PointerEvent) => {
    const p = pos(e);
    if (tool === 'text') {
      textDone.current = false;
      setTextAt(p);
      return;
    }
    canvasRef.current!.setPointerCapture(e.pointerId);
    last.current = p;
    // A tap should leave a dot.
    add({ t: 'line', c: tool === 'eraser' ? PAPER : color, w: tool === 'eraser' ? width * 4 : width, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onMove = (e: PointerEvent) => {
    if (!last.current) return;
    const p = pos(e);
    add({
      t: 'line',
      c: tool === 'eraser' ? PAPER : color,
      w: tool === 'eraser' ? width * 4 : width,
      x0: last.current.x,
      y0: last.current.y,
      x1: p.x,
      y1: p.y,
    });
    last.current = p;
  };

  const onUp = () => {
    last.current = null;
  };

  const commitText = (value: string) => {
    if (textDone.current) return;
    textDone.current = true;
    if (textAt && value.trim()) add({ t: 'text', c: color, s: Math.max(width * 5, 18), x: textAt.x, y: textAt.y, text: value.trim() });
    setTextAt(null);
  };

  const onTextKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitText(e.currentTarget.value);
    if (e.key === 'Escape') setTextAt(null);
  };

  const clear = () => {
    items.current = [];
    redraw();
    socket?.emit('whiteboard:clear');
  };

  const save = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whiteboard.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const toolBtn = (t: Tool, label: string, icon: JSX.Element) => (
    <button
      onClick={() => setTool(t)}
      aria-pressed={tool === t}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2.5 ${tool === t ? 'bg-cobalt text-white' : 'text-night-text hover:bg-night-line'}`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-night-raised p-2 ring-1 ring-night-line">
        {toolBtn('pen', 'Pen', <PenLine size={18} />)}
        {toolBtn('eraser', 'Eraser', <Eraser size={18} />)}
        {toolBtn('text', 'Text', <Type size={18} />)}
        <span className="mx-1 h-6 w-px bg-night-line" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            style={{ backgroundColor: c }}
            className={`h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-night-raised ${color === c ? 'ring-white' : 'ring-transparent'}`}
          />
        ))}
        <span className="mx-1 h-6 w-px bg-night-line" />
        <label className="flex items-center gap-2 text-xs text-night-text">
          Size
          <input type="range" min={2} max={24} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <div className="ml-auto flex gap-1">
          <button onClick={save} className="rounded-lg p-2.5 text-night-text hover:bg-night-line" aria-label="Save as image" title="Save as image">
            <Download size={18} />
          </button>
          <button onClick={clear} className="rounded-lg p-2.5 text-danger hover:bg-night-line" aria-label="Clear board for everyone" title="Clear board for everyone">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="relative w-full max-w-[1100px] self-center overflow-hidden rounded-xl bg-white">
        <canvas
          ref={canvasRef}
          className={`block touch-none ${tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {textAt && (
          <input
            autoFocus
            aria-label="Text to place on the board"
            placeholder="Type, then press Enter"
            onKeyDown={onTextKey}
            onBlur={(e) => commitText(e.currentTarget.value)}
            style={{ left: `${textAt.x * 100}%`, top: `${textAt.y * 100}%`, color }}
            className="absolute min-w-[10rem] -translate-y-1/2 rounded border border-cobalt bg-white/90 px-2 py-1 text-base font-semibold"
          />
        )}
      </div>
    </div>
  );
}
