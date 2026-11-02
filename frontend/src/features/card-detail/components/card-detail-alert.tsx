import { CloseIcon } from '../../../shared/ui/icons';
import { useCardDetailStore } from '../store/card-detail-store';

/** Error of a failed change, inside the dialog where a modal leaves it visible and readable. */
export function CardDetailAlert() {
  const error = useCardDetailStore((state) => state.error);
  const clearError = useCardDetailStore((state) => state.clearError);
  if (!error) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
    >
      <p className="min-w-0 flex-1">{error}</p>
      <button
        type="button"
        aria-label="Uyarıyı kapat"
        onClick={clearError}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-surface-hover"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}
