import { useId, type ComponentProps } from 'react';

interface TextFieldProps extends ComponentProps<'input'> {
  label: string;
  /** Keeps the label for screen readers only (e.g. compact composers with a placeholder). */
  hideLabel?: boolean;
  /** Validation message; also marks the input invalid for screen readers. */
  error?: string;
  hint?: string;
}

/** Labeled input with hint and error text linked through aria-describedby. */
export function TextField({
  label,
  hideLabel = false,
  error,
  hint,
  id,
  className = '',
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-fg'}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`h-10 rounded-md border border-line bg-surface px-3 text-fg placeholder:text-fg-subtle aria-invalid:border-danger ${className}`}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
