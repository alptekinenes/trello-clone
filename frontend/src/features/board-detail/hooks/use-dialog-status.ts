import { useCallback, useState } from 'react';

export interface AnnounceOptions {
  /** Read out by screen readers only; nothing appears on screen. */
  silent?: boolean;
}

/** Puts a message into the dialog's status region. */
export type Announce = (message: string, options?: AnnounceOptions) => void;

export interface DialogStatus {
  /** Changes with every announcement, even of the same text, so the region is read out again. */
  id: number;
  text: string;
  silent: boolean;
}

/**
 * The text of a dialog's one live region. Announcing the same message twice in a row
 * ("Bağlantı kopyalandı." for the second copy) changes `id`, which the region uses to
 * replace its content: screen readers read out only what changes.
 */
export function useDialogStatus() {
  const [status, setStatus] = useState<DialogStatus>({ id: 0, text: '', silent: false });
  const announce = useCallback<Announce>((text, options) => {
    setStatus((previous) => ({ id: previous.id + 1, text, silent: options?.silent ?? false }));
  }, []);
  return { status, announce };
}
