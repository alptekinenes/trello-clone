import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
  /** The pointer or focus is on the toast: its time stops running. Calls add up. */
  hold: (id: number) => void;
  /** Undoes one `hold`; with none left, the rest of the time runs again. */
  release: (id: number) => void;
}

/** How long a toast stays on screen. */
export const TOAST_DURATION_MS = 6000;
const MAX_TOASTS = 3;

interface Countdown {
  remainingMs: number;
  holds: number;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Time left per toast. Paused while the user points at or focuses the toast (WCAG 2.2.1). */
const countdowns = new Map<number, Countdown>();

let nextId = 1;

function startCountdown(id: number, dismiss: (id: number) => void) {
  const countdown = countdowns.get(id);
  if (!countdown) return;
  countdown.startedAt = Date.now();
  countdown.timer = setTimeout(() => dismiss(id), countdown.remainingMs);
}

function stopCountdown(id: number) {
  const countdown = countdowns.get(id);
  if (countdown?.timer) clearTimeout(countdown.timer);
  countdowns.delete(id);
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (toast) => {
    const id = nextId++;
    const kept = [...get().toasts, { ...toast, id }].slice(-MAX_TOASTS);
    for (const old of get().toasts) {
      if (!kept.some((item) => item.id === old.id)) stopCountdown(old.id);
    }
    countdowns.set(id, { remainingMs: TOAST_DURATION_MS, holds: 0, startedAt: 0, timer: null });
    startCountdown(id, get().dismiss);
    set({ toasts: kept });
  },
  dismiss: (id) => {
    stopCountdown(id);
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
  hold: (id) => {
    const countdown = countdowns.get(id);
    if (!countdown) return;
    countdown.holds += 1;
    if (countdown.holds !== 1 || !countdown.timer) return;
    clearTimeout(countdown.timer);
    countdown.timer = null;
    countdown.remainingMs = Math.max(0, countdown.remainingMs - (Date.now() - countdown.startedAt));
  },
  release: (id) => {
    const countdown = countdowns.get(id);
    if (!countdown || countdown.holds === 0) return;
    countdown.holds -= 1;
    if (countdown.holds === 0) startCountdown(id, get().dismiss);
  },
}));

/** Shortcut for code outside components (mutation callbacks). */
export function showToast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}) {
  useToastStore.getState().show({ message, tone: options.tone ?? 'info', action: options.action });
}

/** Test helper. */
export function resetToasts(): void {
  for (const id of [...countdowns.keys()]) stopCountdown(id);
  useToastStore.setState({ toasts: [] });
}
