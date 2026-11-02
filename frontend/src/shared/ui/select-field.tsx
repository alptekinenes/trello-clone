import { useId, type ComponentProps } from 'react';

interface SelectFieldProps extends ComponentProps<'select'> {
  label: string;
}

/** Labeled native select. */
export function SelectField({ label, id, className = '', children, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={selectId} className="text-sm font-medium text-fg">
        {label}
      </label>
      <select
        id={selectId}
        className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-fg"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
