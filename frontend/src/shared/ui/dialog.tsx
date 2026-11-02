import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

type DialogSize = 'md' | 'lg';

interface DialogProps {
  title: string;
  /** Called on Escape and by the dialog's own buttons; the parent then unmounts the dialog. */
  onClose: () => void;
  children: ReactNode;
  /** `lg` is a wide, scrollable panel (card details). */
  size?: DialogSize;
  /** Keeps the title as the accessible name but does not show it. */
  hideTitle?: boolean;
  /** Adds a "Kapat" button in the top right corner. */
  showCloseButton?: boolean;
}

const SIZE_CLASS: Record<DialogSize, string> = {
  md: 'max-w-md p-4 sm:p-6',
  lg: 'max-w-3xl overflow-y-auto p-4 sm:p-6',
};

const DialogCloseContext = createContext<(() => void) | null>(null);

/**
 * Closes the surrounding dialog the native way, so the browser gives focus back to the
 * opener and `onClose` runs. Use it instead of unmounting the dialog directly.
 */
export function useDialogClose(): () => void {
  const close = useContext(DialogCloseContext);
  if (!close) throw new Error('useDialogClose must be used inside a Dialog');
  return close;
}

/**
 * Modal dialog on the native <dialog> element. showModal() makes the rest of
 * the page inert (focus stays inside), closes on Escape and returns focus to
 * the opener when it goes away. Render it only while it should be open.
 */
export function Dialog({
  title,
  onClose,
  children,
  size = 'md',
  hideTitle = false,
  showCloseButton = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function close() {
    ref.current?.close();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // React bubbles `close` through the component tree, so a dialog nested in this one
      // would otherwise report its own close here as well.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // The width (a gutter around the panel on narrow screens) comes from index.css.
      className={`m-auto rounded-lg bg-surface text-fg shadow-raised backdrop:bg-overlay ${SIZE_CLASS[size]}`}
    >
      <h2
        id={titleId}
        className={
          hideTitle ? 'sr-only' : `mb-4 text-lg font-semibold ${showCloseButton ? 'pr-12' : ''}`
        }
      >
        {title}
      </h2>
      {showCloseButton && (
        <button
          type="button"
          aria-label="Kapat"
          onClick={close}
          className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-md pointer-coarse:size-11 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <CloseIcon />
        </button>
      )}
      <DialogCloseContext value={close}>{children}</DialogCloseContext>
    </dialog>
  );
}
