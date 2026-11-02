import type { ComponentProps } from 'react';
import { type ButtonVariant, buttonClassName } from './button-styles';

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
      className={buttonClassName(variant, className)}
      {...props}
    />
  );
}
