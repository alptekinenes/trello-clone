import { useEffect, useRef } from 'react';
import { realtime, type RealtimeListener } from '../lib/realtime-client';

/**
 * Subscribes to every realtime message while mounted. The latest `listener` is
 * always the one called, without re-subscribing on each render.
 */
export function useRealtimeEvents(listener: RealtimeListener): void {
  const listenerRef = useRef(listener);

  useEffect(() => {
    listenerRef.current = listener;
  });

  useEffect(() => realtime.subscribe((message) => listenerRef.current(message)), []);
}
