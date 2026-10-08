import { useEffect, useRef } from 'react';
import { MicOff, MonitorUp } from 'lucide-react';

interface Props {
  stream: MediaStream | null | undefined;
  name: string;
  audioOn: boolean;
  showVideo: boolean;
  sharingScreen?: boolean;
  self?: boolean;
  compact?: boolean;
}

export default function VideoTile({ stream, name, audioOn, showVideo, sharingScreen, self, compact }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== (stream ?? null)) ref.current.srcObject = stream ?? null;
  }, [stream]);

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-night-raised ring-1 ring-night-line">
      {/* Kept mounted even when video is off so remote audio keeps playing. */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={self}
        className={`absolute inset-0 h-full w-full ${sharingScreen ? 'object-contain bg-black' : 'object-cover'} ${
          self && !sharingScreen ? '-scale-x-100' : ''
        } ${showVideo ? '' : 'opacity-0'}`}
      />
      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <span
            className={`grid place-items-center rounded-full bg-cobalt font-display font-bold text-white ${
              compact ? 'h-10 w-10 text-sm' : 'h-20 w-20 text-2xl'
            }`}
          >
            {initials || '?'}
          </span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
        {!audioOn && <MicOff size={12} className="shrink-0 text-danger" aria-label="Muted" />}
        {sharingScreen && <MonitorUp size={12} className="shrink-0 text-signal" aria-label="Sharing screen" />}
        <span className="truncate">{self ? `${name} (you)` : name}</span>
      </div>
    </div>
  );
}
