import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';

interface InlineEditProps {
  value: string;
  /** Accessible name of the input, e.g. "Pano adı". */
  label: string;
  /** Read by screen readers on the view button, e.g. "Pano adını düzenle". */
  editHint: string;
  maxLength?: number;
  /** Wraps long text over several lines instead of truncating it. */
  wrap?: boolean;
  /** Id of the view button, for code that hands the focus back to it. */
  buttonId?: string;
  /** Called with the trimmed text, only when it is non-empty and changed. */
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
}

// Module-level so React calls it once on mount, not on every render.
function focusAndSelect(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

/** Text that turns into an input on click. Enter or blur saves, Escape cancels. */
export function InlineEdit({
  value,
  label,
  editHint,
  maxLength,
  wrap = false,
  buttonId,
  onSave,
  className = '',
  inputClassName = '',
}: InlineEditProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Guards against a second finish (e.g. the blur that follows Enter or Escape).
  const finishedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();

  function start() {
    finishedRef.current = false;
    setDraft(value);
  }

  function finish(save: boolean, { restoreFocus = false } = {}) {
    if (finishedRef.current || draft === null) return;
    finishedRef.current = true;
    const next = draft.trim();
    if (restoreFocus) {
      // Render the button now so keyboard users land back on it.
      flushSync(() => setDraft(null));
      buttonRef.current?.focus();
    } else {
      setDraft(null);
    }
    if (save && next && next !== value) onSave(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true, { restoreFocus: true });
    } else if (event.key === 'Escape') {
      // Keep Escape from also closing a surrounding dialog.
      event.preventDefault();
      event.stopPropagation();
      finish(false, { restoreFocus: true });
    }
  }

  if (draft === null) {
    return (
      <>
        <button
          ref={buttonRef}
          id={buttonId}
          type="button"
          onClick={start}
          aria-describedby={hintId}
          className={`max-w-full rounded-sm text-left ${wrap ? 'whitespace-normal break-words' : 'truncate'} ${className}`}
        >
          {value}
        </button>
        <span id={hintId} hidden>
          {editHint}
        </span>
      </>
    );
  }

  return (
    <input
      ref={focusAndSelect}
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
      className={`rounded-sm ${inputClassName}`}
    />
  );
}
