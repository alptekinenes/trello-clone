import { useRef } from 'react';
import { type RealtimeIndicator, useRealtimeIndicator } from '../hooks/use-realtime-indicator';
import { realtime } from '../lib/realtime-client';
import { Button } from './button';
import { OfflineIcon, SyncIcon } from './icons';

const MESSAGES: Record<RealtimeIndicator, string> = {
  hidden: '',
  reconnecting: 'Bağlantı koptu. Yeniden bağlanılıyor…',
  offline: 'Canlı güncellemeler kapalı.',
  restored: 'Bağlantı yeniden kuruldu.',
};

/**
 * Shows the live-update connection only when something is wrong. The screen-reader message
 * lives in an always-mounted `role="status"` region (without the button, so the label is not
 * read out with it); the visible pill repeats it for sighted users. The pill sits on
 * `bg-surface`, which reads the same on every board background in both themes.
 */
export function RealtimeStatus() {
  const indicator = useRealtimeIndicator();
  const pillRef = useRef<HTMLDivElement>(null);

  // The button disappears while the retry runs; keep the focus in the pill so it is not lost.
  const retry = () => {
    realtime.retry();
    pillRef.current?.focus();
  };

  return (
    <>
      <p role="status" className="sr-only">
        {MESSAGES[indicator]}
      </p>
      {(indicator === 'reconnecting' || indicator === 'offline') && (
        <div
          ref={pillRef}
          tabIndex={-1}
          className="flex min-h-8 max-w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-surface px-3 py-1 text-sm shadow-card"
        >
          {indicator === 'reconnecting' ? (
            <p aria-hidden="true" className="flex min-w-0 items-center gap-2 text-fg-muted">
              <SyncIcon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
              {MESSAGES.reconnecting}
            </p>
          ) : (
            <>
              <p aria-hidden="true" className="flex min-w-0 items-center gap-2 text-warning">
                <OfflineIcon className="size-4 shrink-0" />
                {MESSAGES.offline}
              </p>
              <Button variant="secondary" className="h-6 px-2" onClick={retry}>
                Yeniden bağlan
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
