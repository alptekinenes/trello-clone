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

  describe('holding a toast', () => {
    const idOf = () => useToastStore.getState().toasts[0].id;

    it('stops the time while held and runs the rest after release', () => {
      showToast('A');
      const id = idOf();
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1000);

      useToastStore.getState().hold(id);
      vi.advanceTimersByTime(TOAST_DURATION_MS * 3);
      expect(useToastStore.getState().toasts).toHaveLength(1);

      useToastStore.getState().release(id);
      vi.advanceTimersByTime(999);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts).toEqual([]);
    });

    it('waits until every hold is released', () => {
      showToast('A');
      const id = idOf();
      useToastStore.getState().hold(id);
      useToastStore.getState().hold(id);
      useToastStore.getState().release(id);
      vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
      expect(useToastStore.getState().toasts).toHaveLength(1);

      useToastStore.getState().release(id);
      vi.advanceTimersByTime(TOAST_DURATION_MS);
      expect(useToastStore.getState().toasts).toEqual([]);
    });

    it('does not touch the other toasts', () => {
      showToast('A');
      showToast('B');
      useToastStore.getState().hold(idOf());
      vi.advanceTimersByTime(TOAST_DURATION_MS);
      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['A']);
    });

    it('ignores a release without a hold and holds on gone toasts', () => {
      showToast('A');
      const id = idOf();
      useToastStore.getState().release(id);
      useToastStore.getState().dismiss(id);
      useToastStore.getState().hold(id);
      vi.advanceTimersByTime(TOAST_DURATION_MS);
      expect(useToastStore.getState().toasts).toEqual([]);
    });
  });
});
