import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast, TOAST_DURATION_MS, useToastStore } from './toast-store';

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast and removes it after a while', () => {
    showToast('Liste arşivlendi.');
    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ message: 'Liste arşivlendi.', tone: 'info' }),
    ]);

    vi.advanceTimersByTime(TOAST_DURATION_MS);

    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('keeps at most three toasts, dropping the oldest', () => {
    for (const message of ['1', '2', '3', '4']) showToast(message);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['2', '3', '4']);
  });

  it('dismisses a toast by id', () => {
    showToast('A', { tone: 'error' });
    const [toast] = useToastStore.getState().toasts;
    useToastStore.getState().dismiss(toast.id);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
