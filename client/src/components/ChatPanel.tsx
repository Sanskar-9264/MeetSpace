import { FormEvent, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { ChatMsg } from '../types';

interface Props {
  messages: ChatMsg[];
  meId: string;
  onSend: (text: string) => void;
}

export default function ChatPanel({ messages, meId, onSend }: Props) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-sm text-night-text/70">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.userId === meId;
          return (
            <div key={m.id} className={mine ? 'text-right' : ''}>
              <p className="text-xs text-night-text/60">
                {mine ? 'You' : m.name} · {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p
                className={`mt-0.5 inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-left text-sm ${
                  mine ? 'bg-cobalt text-white' : 'bg-night-line text-white'
                }`}
              >
                {m.text}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-night-line p-3">
        <input
          className="min-w-0 flex-1 rounded-lg border border-night-line bg-night px-3 py-2 text-sm text-white placeholder:text-night-text/50"
          placeholder="Write a message"
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
        />
        <button className="btn-primary !px-3" aria-label="Send message">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
