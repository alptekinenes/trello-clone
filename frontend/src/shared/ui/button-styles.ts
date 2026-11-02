export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'on-board';

const BASE =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface-sunken text-fg hover:bg-surface-hover',
  ghost: 'text-fg hover:bg-surface-hover',
  danger: 'bg-danger text-on-danger hover:bg-danger-hover',
  /** Translucent control on top of a board background; its focus ring is light, the blue one vanishes on blue boards. */
  'on-board':
    'bg-board-control text-on-board hover:bg-board-control-hover focus-visible:outline-on-board',
};

/** The classes of a button; also for a link that has to look like one. */
export function buttonClassName(variant: ButtonVariant = 'primary', extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${extra}`.trim();
}
