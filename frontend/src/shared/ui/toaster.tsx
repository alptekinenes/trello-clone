import { useToastHold } from '../hooks/use-toast-hold';
import { type Toast, useToastStore } from '../store/toast-store';
import { CloseIcon } from './icons';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const ref = useToastHold<HTMLDivElement>(toast.id);

  return (
    <div
      ref={ref}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md px-4 py-3 pointer-coarse:py-1 text-sm shadow-raised ${
        toast.tone === 'error' ? 'bg-danger-subtle text-danger' : 'bg-surface text-fg'
      }`}
    >
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            dismiss(toast.id);
          }}
          className="inline-flex items-center justify-center rounded-sm font-semibold text-primary pointer-coarse:min-h-11 pointer-coarse:min-w-11 hover:text-primary-hover"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Bildirimi kapat"
        onClick={() => dismiss(toast.id)}
        className="inline-flex items-center justify-center rounded-sm text-fg-muted pointer-coarse:size-11 hover:text-fg"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/**
 * Short messages at the bottom of the screen. Read by screen readers as they appear.
 * The time stops while the pointer or focus is on a toast; Escape closes the one in focus.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
