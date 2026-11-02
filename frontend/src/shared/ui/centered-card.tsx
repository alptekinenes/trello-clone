import { useId, type ReactNode } from 'react';

interface CenteredCardProps {
  /** The page's h1. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** A card in the middle of an otherwise empty page (sign in, invitation). */
export function CenteredCard({ title, children, footer }: CenteredCardProps) {
  const titleId = useId();

  return (
    <div className="flex justify-center px-4 py-12 sm:py-16">
      <section
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-raised sm:p-8"
      >
        <h1 id={titleId} className="text-center text-xl font-semibold break-words">
          {title}
        </h1>
        <div className="mt-6 break-words">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-fg-muted">{footer}</p>}
      </section>
    </div>
  );
}
