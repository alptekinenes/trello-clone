import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DUE_SOON_MS,
  formatDueLong,
  formatDueShort,
  formatRelativeTime,
  fromDateTimeLocalValue,
  getDueStatus,
  toDateTimeLocalValue,
} from './date';

const NOW = Date.parse('2026-11-05T12:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function useTimeZone(zone: string) {
  vi.stubEnv('TZ', zone);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getDueStatus', () => {
  it('has no status without a due date', () => {
    expect(getDueStatus(null, false, NOW)).toBeNull();
    expect(getDueStatus(null, true, NOW)).toBeNull();
  });

  it('is overdue once the due date has passed', () => {
    expect(getDueStatus(at(-1), false, NOW)).toBe('overdue');
  });

  it('is soon right now and up to exactly 24 hours ahead', () => {
    expect(getDueStatus(at(0), false, NOW)).toBe('soon');
    expect(getDueStatus(at(DUE_SOON_MS), false, NOW)).toBe('soon');
  });

  it('is upcoming beyond 24 hours', () => {
    expect(getDueStatus(at(DUE_SOON_MS + 1), false, NOW)).toBe('upcoming');
  });

  it('is done when completed, even if it is in the past', () => {
    expect(getDueStatus(at(-DUE_SOON_MS), true, NOW)).toBe('done');
    expect(getDueStatus(at(DUE_SOON_MS * 3), true, NOW)).toBe('done');
  });
});

describe('formatting', () => {
  it('shows day and month, and the year only when it is not the current one', () => {
    useTimeZone('Europe/Istanbul');
    expect(formatDueShort('2026-11-05T11:30:00.000Z', NOW)).toBe('5 Kas');
    expect(formatDueShort('2027-11-05T11:30:00.000Z', NOW)).toBe('5 Kas 2027');
  });

  it('writes the long form in local time', () => {
    useTimeZone('Europe/Istanbul');
    expect(formatDueLong('2026-11-05T11:30:00.000Z')).toBe('5 Kasım 2026 14:30');
  });
});

describe('datetime-local values', () => {
  it('converts to a local value and back to the same UTC instant', () => {
    useTimeZone('Europe/Istanbul');
    const iso = '2026-11-05T11:30:00.000Z';
    expect(toDateTimeLocalValue(iso)).toBe('2026-11-05T14:30');
    expect(fromDateTimeLocalValue('2026-11-05T14:30')).toBe(iso);
  });

  it.each([
    ['Europe/Berlin', '2026-03-29T12:00', '2026-03-29T10:00:00.000Z'],
    ['Europe/Berlin', '2026-10-25T12:00', '2026-10-25T11:00:00.000Z'],
    ['America/New_York', '2026-03-08T12:00', '2026-03-08T16:00:00.000Z'],
    ['America/New_York', '2026-11-01T12:00', '2026-11-01T17:00:00.000Z'],
  ])('round-trips on a DST change day in %s (%s)', (zone, local, utc) => {
    useTimeZone(zone);
    expect(fromDateTimeLocalValue(local)).toBe(utc);
    expect(toDateTimeLocalValue(utc)).toBe(local);
  });

  it('rejects values that are not a date and time', () => {
    expect(fromDateTimeLocalValue('')).toBeNull();
    expect(fromDateTimeLocalValue('yarın')).toBeNull();
    expect(fromDateTimeLocalValue('2026-02-31T10:00')).toBeNull();
    expect(fromDateTimeLocalValue('2026-11-05')).toBeNull();
  });
});

describe('formatRelativeTime', () => {
  it('says "az önce" for the first 45 seconds, and for a clock that runs ahead', () => {
    expect(formatRelativeTime(at(0), NOW)).toBe('az önce');
    expect(formatRelativeTime(at(-44_000), NOW)).toBe('az önce');
    expect(formatRelativeTime(at(60_000), NOW)).toBe('az önce');
  });

  it('counts minutes up to an hour', () => {
    expect(formatRelativeTime(at(-45_000), NOW)).toBe('1 dakika önce');
    expect(formatRelativeTime(at(-5 * 60_000), NOW)).toBe('5 dakika önce');
    expect(formatRelativeTime(at(-59 * 60_000), NOW)).toBe('59 dakika önce');
  });

  it('counts hours up to a day', () => {
    expect(formatRelativeTime(at(-60 * 60_000), NOW)).toBe('1 saat önce');
    expect(formatRelativeTime(at(-23 * 60 * 60_000), NOW)).toBe('23 saat önce');
  });

  it('says "dün" and counts days up to a week', () => {
    const day = 24 * 60 * 60_000;
    expect(formatRelativeTime(at(-day), NOW)).toBe('dün');
    expect(formatRelativeTime(at(-3 * day), NOW)).toBe('3 gün önce');
    expect(formatRelativeTime(at(-6 * day), NOW)).toBe('6 gün önce');
  });

  it('writes the date and time from a week on, with the year only when it differs', () => {
    const day = 24 * 60 * 60_000;
    expect(formatRelativeTime(at(-7 * day), NOW)).toMatch(/^\d{1,2} \p{L}+\.? \d{2}:\d{2}$/u);
    expect(formatRelativeTime(at(-400 * day), NOW)).toMatch(/^\d{1,2} \p{L}+\.? \d{4} \d{2}:\d{2}$/u);
  });
});
