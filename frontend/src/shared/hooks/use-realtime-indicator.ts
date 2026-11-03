import { useEffect, useState } from 'react';
import { useRealtimeStatus } from '../store/realtime-store';

/** A drop shorter than this is not worth showing; the client usually restores it by itself. */
export const RECONNECT_GRACE_MS = 3_000;

/** How long the "connection is back" announcement stays in the live region. */
export const RESTORED_MS = 4_000;

export type RealtimeIndicator = 'hidden' | 'reconnecting' | 'offline' | 'restored';

/**
 * What the connection indicator should show. `offline` is immediate. `reconnecting` appears
 * only after the grace period, and once an outage has been shown (or went offline) it stays
 * visible until the connection is back, so pressing "retry" does not blank the indicator.
 * After such an outage `restored` is returned briefly, so the recovery can be announced.
 */
export function useRealtimeIndicator(): RealtimeIndicator {
  const status = useRealtimeStatus();
  const [revealed, setRevealed] = useState(false);
  const [restored, setRestored] = useState(false);
  const degraded = status === 'reconnecting' || status === 'offline';

  // Derived from status during render (React re-renders at once), not through an effect.
  if (status === 'offline' && !revealed) setRevealed(true);
  if (!degraded && revealed) {
    setRevealed(false);
    setRestored(true);
  }
  if (degraded && restored) setRestored(false);

  const waiting = status === 'reconnecting' && !revealed;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setRevealed(true), RECONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => setRestored(false), RESTORED_MS);
    return () => clearTimeout(timer);
  }, [restored]);

  if (status === 'offline') return 'offline';
  if (status === 'reconnecting' && revealed) return 'reconnecting';
  return restored ? 'restored' : 'hidden';
}
