import { useRealtimeIndicator } from '../hooks/use-realtime-indicator';
import { realtime } from '../lib/realtime-client';
import { Button } from './button';
import { OfflineIcon, SyncIcon } from './icons';

/**
 * Shows the live-update connection only when something is wrong. The `role="status"` box is
 * always in the DOM so screen readers announce the text that appears inside it. The pill sits
 * on `bg-surface`, which reads the same on every board background in both themes.
 */
export function RealtimeStatus({ className = '' }: { className?: string }) {
  const indicator = useRealtimeIndicator();

  return (
    <div role="status" className={`max-w-full ${className}`.trim()}>
      {indicator !== 'hidden' && (
        <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-surface px-3 py-1 text-sm shadow-card">
          {indicator === 'reconnecting' ? (
            <p className="flex min-w-0 items-center gap-2 text-fg-muted">
              <SyncIcon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
              Bağlantı koptu. Yeniden bağlanılıyor…
            </p>
          ) : (
            <>
              <p className="flex min-w-0 items-center gap-2 text-warning">
                <OfflineIcon className="size-4 shrink-0" />
                Canlı güncellemeler kapalı.
              </p>
              <Button variant="secondary" className="h-7 px-2" onClick={realtime.retry}>
                Yeniden bağlan
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
