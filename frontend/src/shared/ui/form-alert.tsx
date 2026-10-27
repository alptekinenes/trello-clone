import type { ReactNode } from 'react';

/** Form-level error, announced to screen readers when it appears. */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
      {children}
    </div>
  );
}
