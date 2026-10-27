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
}

/** How long a toast stays on screen. */
export const TOAST_DURATION_MS = 6000;
const MAX_TOASTS = 3;

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (toast) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_TOASTS) }));
    setTimeout(() => get().dismiss(id), TOAST_DURATION_MS);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Shortcut for code outside components (mutation callbacks). */
export function showToast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}) {
  useToastStore.getState().show({ message, tone: options.tone ?? 'info', action: options.action });
}

/** Test helper. */
export function resetToasts(): void {
  useToastStore.setState({ toasts: [] });
}
