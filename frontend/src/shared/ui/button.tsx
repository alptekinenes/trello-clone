import type { ComponentProps } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BASE =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface-sunken text-fg hover:bg-surface-hover',
  ghost: 'text-fg hover:bg-surface-hover',
};

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  /** Disables the button and marks it busy while an action runs. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
