export type DueStatus = 'done' | 'overdue' | 'soon' | 'upcoming';

/** A due date closer than this (and not yet past) counts as "soon". */
export const DUE_SOON_MS = 24 * 60 * 60 * 1000;

const LOCALE = 'tr-TR';
const shortFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const shortWithYearFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const longFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const DATE_TIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Status of a due date at `now`, or null when the card has none. Completed wins over late. */
export function getDueStatus(
  dueDate: string | null,
  dueComplete: boolean,
  now = Date.now(),
): DueStatus | null {
  if (dueDate === null) return null;
  if (dueComplete) return 'done';
  const remaining = new Date(dueDate).getTime() - now;
  if (remaining < 0) return 'overdue';
  return remaining <= DUE_SOON_MS ? 'soon' : 'upcoming';
}

/** "5 Kas"; the year is added when it differs from the year of `now`. */
export function formatDueShort(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return (sameYear ? shortFormat : shortWithYearFormat).format(date);
}

/** "5 Kasım 2026 14:30" in local time. */
export function formatDueLong(iso: string): string {
  return longFormat.format(new Date(iso));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
export function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * UTC ISO string for a local datetime-local value. Null when it is not a real local time
 * (e.g. 31 February, or the hour skipped by a DST change): Date would silently shift those.
 */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!DATE_TIME_LOCAL.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString();
  return toDateTimeLocalValue(iso) === value ? iso : null;
}
