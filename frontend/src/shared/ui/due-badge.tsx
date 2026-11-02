import { formatDueLong, formatDueShort, getDueStatus, type DueStatus } from '../lib/date';
import { ClockIcon } from './icons';

interface DueBadgeProps {
  dueDate: string;
  dueComplete: boolean;
}

const STATUS_CLASS: Record<DueStatus, string> = {
  overdue: 'bg-danger-subtle text-danger',
  soon: 'bg-warning-subtle text-warning',
  done: 'bg-success-subtle text-success',
  upcoming: 'text-fg-muted',
};

const STATUS_TEXT: Record<DueStatus, string> = {
  overdue: 'gecikti',
  soon: 'yaklaşıyor',
  done: 'tamamlandı',
  upcoming: '',
};

/** Due date with its state (late, soon, done). The state is computed at render time. */
export function DueBadge({ dueDate, dueComplete }: DueBadgeProps) {
  const status = getDueStatus(dueDate, dueComplete) ?? 'upcoming';
  const spoken = [`Son tarih: ${formatDueLong(dueDate)}`, STATUS_TEXT[status]]
    .filter(Boolean)
    .join(', ');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs ${STATUS_CLASS[status]}`}
    >
      <ClockIcon className="size-3.5" />
      <span aria-hidden="true">{formatDueShort(dueDate)}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
