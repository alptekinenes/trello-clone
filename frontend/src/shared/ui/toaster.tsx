import { useToastStore } from '../store/toast-store';
import { CloseIcon } from './icons';

/** Short messages at the bottom of the screen. Read by screen readers as they appear. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md px-4 py-3 text-sm shadow-raised ${
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
              className="rounded-sm font-semibold text-primary hover:text-primary-hover"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Bildirimi kapat"
            onClick={() => dismiss(toast.id)}
            className="rounded-sm text-fg-muted hover:text-fg"
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
