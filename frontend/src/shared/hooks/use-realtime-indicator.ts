import { useEffect, useState } from 'react';
import { useRealtimeStatus } from '../store/realtime-store';

/** A drop shorter than this is not worth showing; the client usually restores it by itself. */
export const RECONNECT_GRACE_MS = 3_000;

export type RealtimeIndicator = 'hidden' | 'reconnecting' | 'offline';

/**
 * What the connection indicator should show. `offline` is immediate. `reconnecting` appears
 * only after the grace period, and once an outage has been shown (or went offline) it stays
 * visible until the connection is back, so pressing "retry" does not blank the indicator.
 */
export function useRealtimeIndicator(): RealtimeIndicator {
  const status = useRealtimeStatus();
  const [revealed, setRevealed] = useState(false);
  const degraded = status === 'reconnecting' || status === 'offline';

  // Derived from status during render (React re-renders at once), not through an effect.
  if (status === 'offline' && !revealed) setRevealed(true);
  if (!degraded && revealed) setRevealed(false);

  const waiting = status === 'reconnecting' && !revealed;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setRevealed(true), RECONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  if (status === 'offline') return 'offline';
  if (status === 'reconnecting' && revealed) return 'reconnecting';
  return 'hidden';
}
