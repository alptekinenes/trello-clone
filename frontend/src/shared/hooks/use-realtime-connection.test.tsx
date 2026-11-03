import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeRealtime } from '../../test/fake-realtime';
import { useRealtimeStore } from '../store/realtime-store';
import { useRealtimeConnection } from './use-realtime-connection';

describe('useRealtimeConnection', () => {
  it('connects while enabled and closes when disabled', () => {
    const { rerender } = renderHook(({ enabled }) => useRealtimeConnection(enabled), {
      initialProps: { enabled: false },
    });
    expect(useRealtimeStore.getState().status).toBe('idle');

    rerender({ enabled: true });
    expect(useRealtimeStore.getState().status).toBe('connecting');
    fakeRealtime.connect();
    expect(useRealtimeStore.getState().status).toBe('connected');

    rerender({ enabled: false });
    expect(useRealtimeStore.getState().status).toBe('idle');
  });

  it('closes on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeConnection(true));
    fakeRealtime.connect();

    unmount();

    expect(useRealtimeStore.getState().status).toBe('idle');
    expect(fakeRealtime.socket.connected).toBe(false);
  });
});
