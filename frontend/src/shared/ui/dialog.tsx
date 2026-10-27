import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  /** Called on Escape and by the dialog's own buttons; the parent then unmounts the dialog. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal dialog on the native <dialog> element. showModal() makes the rest of
 * the page inert (focus stays inside), closes on Escape and returns focus to
 * the opener when it goes away. Render it only while it should be open.
 */
export function Dialog({ title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-md rounded-lg bg-surface p-6 text-fg shadow-raised backdrop:bg-overlay"
    >
      <h2 id={titleId} className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
