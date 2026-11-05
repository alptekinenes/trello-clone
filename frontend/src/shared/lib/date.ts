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

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const timeOfDayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const timeOfDayWithYearFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const JUST_NOW_MS = 45 * SECOND_MS;

/**
 * How long ago something happened: "az önce", "5 dakika önce", "3 saat önce", "dün", "3 gün önce";
 * from a week on the date and time ("5 Kas 14:30", with the year when it differs from `now`'s).
 */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso);
  const age = now - then.getTime();
  if (age < JUST_NOW_MS) return 'az önce';
  if (age < HOUR_MS) return relativeFormat.format(-Math.max(1, Math.floor(age / MINUTE_MS)), 'minute');
  if (age < DAY_MS) return relativeFormat.format(-Math.floor(age / HOUR_MS), 'hour');
  if (age < 7 * DAY_MS) return relativeFormat.format(-Math.floor(age / DAY_MS), 'day');
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return (sameYear ? timeOfDayFormat : timeOfDayWithYearFormat).format(then);
}
