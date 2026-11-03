import { useCallback, useEffect, useMemo, useRef } from 'react';
import { realtime } from '../lib/realtime-client';

export interface RealtimeHold {
  /** Starts holding incoming events (no-op while already holding). */
  hold: () => void;
  /** Lets the held events through, in order (no-op when not holding). */
  release: () => void;
}

/** Holds realtime events, e.g. during a drag. A hold still active on unmount is released. */
export function useRealtimeHold(): RealtimeHold {
  const releaseRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);

  const hold = useCallback(() => {
    releaseRef.current ??= realtime.hold();
  }, []);

  useEffect(() => release, [release]);

  return useMemo(() => ({ hold, release }), [hold, release]);
}
