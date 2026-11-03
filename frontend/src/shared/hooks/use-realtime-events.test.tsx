import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { realtime } from '../lib/realtime-client';
import { fakeRealtime } from '../../test/fake-realtime';
import { useRealtimeEvents } from './use-realtime-events';

function startConnected() {
  realtime.start();
  fakeRealtime.connect();
}

const deleted = () => fakeRealtime.serverEmit('card:deleted', { id: 'c1', listId: 'L1' }, { boardId: 'B1' });

describe('useRealtimeEvents', () => {
  it('calls the listener for incoming events and stops on unmount', () => {
    const listener = vi.fn();
    const { unmount } = renderHook(() => useRealtimeEvents(listener));
    startConnected();

    deleted();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ type: 'card:deleted', boardId: 'B1' });

    unmount();
    deleted();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('always calls the latest listener without subscribing again', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ listener }) => useRealtimeEvents(listener), {
      initialProps: { listener: first },
    });
    startConnected();

    rerender({ listener: second });
    deleted();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
