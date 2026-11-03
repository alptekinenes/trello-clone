import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { realtime } from '../lib/realtime-client';
import { fakeRealtime } from '../../test/fake-realtime';
import { useRealtimeHold } from './use-realtime-hold';

function setup() {
  const listener = vi.fn();
  realtime.subscribe(listener);
  realtime.start();
  fakeRealtime.connect();
  return listener;
}

const deleted = () => fakeRealtime.serverEmit('card:deleted', { id: 'c1', listId: 'L1' }, { boardId: 'B1' });

describe('useRealtimeHold', () => {
  it('holds events until release', () => {
    const listener = setup();
    const { result } = renderHook(() => useRealtimeHold());

    result.current.hold();
    deleted();
    expect(listener).not.toHaveBeenCalled();

    result.current.release();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('counts one hold however often hold is called, and release is idempotent', () => {
    const listener = setup();
    const { result } = renderHook(() => useRealtimeHold());

    result.current.hold();
    result.current.hold();
    deleted();
    result.current.release();
    result.current.release();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('releases a hold that is still active on unmount', () => {
    const listener = setup();
    const { result, unmount } = renderHook(() => useRealtimeHold());
    result.current.hold();
    deleted();

    unmount();

    expect(listener).toHaveBeenCalledOnce();
  });

  it('keeps stable functions across renders', () => {
    const { result, rerender } = renderHook(() => useRealtimeHold());
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });
});
