import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/** Decorative 16px stroke icons; the surrounding control carries the accessible name. */
function Icon({ children, className = 'size-4', ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3v10M3 8h10" />
    </Icon>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" strokeWidth={2.5} />
    </Icon>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h.01M8 8h.01M12 8h.01" strokeWidth={2.5} />
    </Icon>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 3.5h11v3h-11zM3.5 6.5v6h9v-6M6.5 9h3" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.2l2 1.3" />
    </Icon>
  );
}

export function DescriptionIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 4h10M3 8h10M3 12h6" />
    </Icon>
  );
}

export function ChecklistIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M5.5 8.2l1.7 1.7 3.3-3.6" />
    </Icon>
  );
}

export function LabelIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 3.5v4l6 6 5-5-6-6h-4a1 1 0 0 0-1 1z" />
      <path d="M5.5 5.5h.01" strokeWidth={2.5} />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M7 7v4M9 7v4" />
    </Icon>
  );
}

export function SyncIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3" />
    </Icon>
  );
}

export function OfflineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.1 11.9l7.8-7.8" />
    </Icon>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10l4-4 4 4" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6l4 4 4-4" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </Icon>
  );
}

export function MembersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <path d="M10.5 3.2a2.5 2.5 0 0 1 0 4.6M12 9.8c1.5.5 2.5 1.8 2.5 3.7" />
    </Icon>
  );
}

export function CoverIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12" />
    </Icon>
  );
}
