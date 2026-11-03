import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeStore, type RealtimeStatus } from '../store/realtime-store';
import { RECONNECT_GRACE_MS, RESTORED_MS, useRealtimeIndicator } from './use-realtime-indicator';

function setStatus(next: RealtimeStatus) {
  act(() => useRealtimeStore.getState().setStatus(next));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRealtimeIndicator', () => {
  it.each<RealtimeStatus>(['idle', 'connecting', 'connected'])('is hidden while %s', (status) => {
    const { result } = renderHook(() => useRealtimeIndicator());
    setStatus(status);
    advance(RECONNECT_GRACE_MS * 2);
    expect(result.current).toBe('hidden');
  });

  it('turns reconnecting visible only after the grace period', () => {
    const { result } = renderHook(() => useRealtimeIndicator());
    setStatus('reconnecting');
    expect(result.current).toBe('hidden');

    advance(RECONNECT_GRACE_MS - 1);
    expect(result.current).toBe('hidden');
    advance(1);
    expect(result.current).toBe('reconnecting');
  });

  it('starts the grace period again after an outage ended', () => {
    const { result } = renderHook(() => useRealtimeIndicator());
    setStatus('reconnecting');
    advance(RECONNECT_GRACE_MS);
    setStatus('connected');
    expect(result.current).toBe('restored');
    advance(RESTORED_MS);
    expect(result.current).toBe('hidden');

    setStatus('reconnecting');
    expect(result.current).toBe('hidden');
  });

  it('announces the recovery only after an outage that was shown', () => {
    const { result } = renderHook(() => useRealtimeIndicator());
    setStatus('reconnecting');
    advance(RECONNECT_GRACE_MS - 1);
    setStatus('connected');
    advance(RECONNECT_GRACE_MS);
    expect(result.current).toBe('hidden');
  });

  it('drops the recovery message when the connection breaks again', () => {
    const { result } = renderHook(() => useRealtimeIndicator());
    setStatus('offline');
    setStatus('connected');
    expect(result.current).toBe('restored');

    setStatus('offline');
    expect(result.current).toBe('offline');
  });

  it('is offline immediately and stays visible when the retry starts reconnecting', () => {
    const { result } = renderHook(() => useRealtimeIndicator());
    setStatus('offline');
    expect(result.current).toBe('offline');

    setStatus('reconnecting');
    expect(result.current).toBe('reconnecting');
  });

  it('starts as offline when mounted while offline', () => {
    setStatus('offline');
    const { result } = renderHook(() => useRealtimeIndicator());
    expect(result.current).toBe('offline');
  });
});
