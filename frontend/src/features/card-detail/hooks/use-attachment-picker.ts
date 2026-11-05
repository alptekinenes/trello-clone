import { ATTACHMENT_ACCEPT } from '@trello/contracts';
import { type ChangeEvent, useRef } from 'react';

/**
 * The hidden file input behind the "Ek" and "Ekle" buttons. Spread `inputProps` on an
 * `<input>`; `open` shows the system's file chooser (camera and gallery on phones).
 */
export function useAttachmentPicker(onFiles: (files: File[]) => void) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // The same file picked again must still count as a change.
    event.target.value = '';
    if (files.length > 0) onFiles(files);
  }

  return {
    open: () => inputRef.current?.click(),
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      multiple: true,
      accept: ATTACHMENT_ACCEPT,
      'aria-label': 'Dosya seç',
      tabIndex: -1,
      className: 'hidden',
      onChange,
    },
  };
}
