import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarDaysBetween,
  endOfWeek,
  formatLocalDate,
  formatLocalDateTime,
  formatLogTimestamp,
  formatShortDate,
  normaliseLogTimestamp,
  normaliseTimestamp,
  parseLocalDate,
  parseTimestamp,
} from './time';

describe('formatting', () => {
  const date = new Date(2026, 0, 5, 7, 4, 9);

  it('formats local dates and times with zero padding', () => {
    expect(formatLocalDate(date)).toBe('2026-01-05');
    expect(formatLocalDateTime(date)).toBe('2026-01-05T07:04:09');
    expect(formatLogTimestamp(date)).toBe('2026-01-05 07:04');
  });

  it('formats a short date as d MMM', () => {
    expect(formatShortDate('2026-11-20')).toBe('20 Nov');
    expect(formatShortDate('2026-09-05')).toBe('5 Sep');
  });
});

describe('tolerant timestamp parsing', () => {
  it.each([
    ['2026-11-16T09:30:00', '2026-11-16T09:30:00'],
    ['2026-11-16 09:30', '2026-11-16T09:30:00'],
    ['2026-11-16T09:30', '2026-11-16T09:30:00'],
    ['2026-11-16 09:30:45', '2026-11-16T09:30:45'],
    ['2026-11-16T09:30:45.678', '2026-11-16T09:30:45'],
    ['2026-11-16', '2026-11-16T00:00:00'],
    ['  2026-11-16 09:30  ', '2026-11-16T09:30:00'],
  ])('reads %s', (raw, expected) => {
    expect(normaliseTimestamp(raw)).toBe(expected);
  });

  it.each(['', 'yesterday', '2026-13-01', '2026-02-30', '2026-11-16T24:00', '2026-11-16T09:60', '16/11/2026', '2026-11-16Z'])(
    'rejects %j',
    (raw) => {
      expect(parseTimestamp(raw)).toBeNull();
    },
  );

  it('reads an offset as an absolute moment', () => {
    expect(parseTimestamp('2026-11-16T09:30:00Z')?.toISOString()).toBe('2026-11-16T09:30:00.000Z');
    expect(parseTimestamp('2026-11-16T09:30:00+10:00')?.toISOString()).toBe('2026-11-15T23:30:00.000Z');
    expect(parseTimestamp('2026-11-16 09:30 -0530')?.toISOString()).toBe('2026-11-16T15:00:00.000Z');
    expect(parseTimestamp('2026-11-16T09:30+10')?.toISOString()).toBe('2026-11-15T23:30:00.000Z');
  });

  it('formats a log timestamp from any tolerated input', () => {
    expect(normaliseLogTimestamp('2026-11-16T14:02:59')).toBe('2026-11-16 14:02');
    expect(normaliseLogTimestamp('nope')).toBeNull();
  });

  it('accepts a leap day only in leap years', () => {
    expect(parseLocalDate('2028-02-29')).toBe('2028-02-29');
    expect(parseLocalDate('2026-02-29')).toBeNull();
    expect(parseLocalDate('2026-2-9')).toBeNull();
  });
});

describe('calendarDaysBetween', () => {
  it('counts calendar days across a month and a year boundary', () => {
    expect(calendarDaysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(calendarDaysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(calendarDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(calendarDaysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('is negative when the second date is earlier and zero for the same date', () => {
    expect(calendarDaysBetween('2026-11-16', '2026-11-14')).toBe(-2);
    expect(calendarDaysBetween('2026-11-16', '2026-11-16')).toBe(0);
  });

  it('is not thrown out by daylight saving changes', () => {
    expect(calendarDaysBetween('2026-10-03', '2026-10-06')).toBe(3);
    expect(calendarDaysBetween('2026-04-04', '2026-04-11')).toBe(7);
    expect(calendarDaysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(calendarDaysBetween('2026-11-01', '2026-11-08')).toBe(7);
  });
});

describe('addDays', () => {
  it('moves across months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('endOfWeek', () => {
  it.each([
    ['2026-11-16', '2026-11-22'],
    ['2026-11-18', '2026-11-22'],
    ['2026-11-21', '2026-11-22'],
    ['2026-11-22', '2026-11-22'],
    ['2026-11-23', '2026-11-29'],
    ['2026-12-30', '2027-01-03'],
  ])('ends the week of %s on %s', (date, expected) => {
    expect(endOfWeek(date)).toBe(expected);
  });
});
