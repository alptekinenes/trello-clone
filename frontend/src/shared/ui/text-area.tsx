import { useId, type ComponentProps } from 'react';

interface TextAreaProps extends ComponentProps<'textarea'> {
  label: string;
  /** Keeps the label for screen readers only (e.g. compact composers with a placeholder). */
  hideLabel?: boolean;
  /** Validation message; also marks the field invalid for screen readers. */
  error?: string;
}

/** Labeled multi-line field that grows with its text; the error is linked through aria-describedby. */
export function TextArea({
  label,
  hideLabel = false,
  error,
  id,
  className = '',
  ...props
}: TextAreaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-fg'}>
        {label}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`field-sizing-content min-h-16 resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle aria-invalid:border-danger ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
