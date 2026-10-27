import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, children, footer }: AuthCardProps) {
  return (
    <div className="flex justify-center px-4 py-12 sm:py-16">
      <section
        aria-labelledby="auth-title"
        className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-raised sm:p-8"
      >
        <h1 id="auth-title" className="text-center text-xl font-semibold">
          {title}
        </h1>
        <div className="mt-6">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-fg-muted">{footer}</p>}
      </section>
    </div>
  );
}
