import { useEffect } from 'react';
import { realtime } from '../lib/realtime-client';

/** Keeps the shared socket connected while `enabled` (signed in) and closes it otherwise. */
export function useRealtimeConnection(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    realtime.start();
    return () => realtime.stop();
  }, [enabled]);
}
