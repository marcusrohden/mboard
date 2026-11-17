import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarDaysBetween,
  formatCompactDate,
  formatCompactDateTime,
  endOfWeek,
  formatLocalDate,
  formatLocalDateTime,
  formatLogTimestamp,
  formatShortDate,
  normaliseLogTimestamp,
  normaliseTimestamp,
  parseLocalDate,
  parseTimestamp,
  workingDaysBetween,
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

describe('workingDaysBetween', () => {
  it('counts the Monday to Friday days after the first date, up to and including the second', () => {
    expect(workingDaysBetween('2026-11-16', '2026-11-16')).toBe(0);
    expect(workingDaysBetween('2026-11-16', '2026-11-17')).toBe(1);
    expect(workingDaysBetween('2026-11-16', '2026-11-20')).toBe(4);
    expect(workingDaysBetween('2026-11-16', '2026-11-23')).toBe(5);
  });

  it.each([
    ['Friday to Saturday', '2026-11-13', '2026-11-14', 0],
    ['Friday to Sunday', '2026-11-13', '2026-11-15', 0],
    ['Friday to Monday', '2026-11-13', '2026-11-16', 1],
    ['Saturday to Monday', '2026-11-14', '2026-11-16', 1],
    ['Sunday to Monday', '2026-11-15', '2026-11-16', 1],
    ['Saturday to Sunday', '2026-11-14', '2026-11-15', 0],
    ['Thursday to the next Tuesday', '2026-11-12', '2026-11-17', 3],
    ['Wednesday to the Wednesday two weeks later', '2026-11-04', '2026-11-18', 10],
  ])('crosses a weekend: %s', (_name, from, to, expected) => {
    expect(workingDaysBetween(from, to)).toBe(expected);
  });

  it('crosses month and year ends', () => {
    expect(workingDaysBetween('2026-10-30', '2026-11-02')).toBe(1);
    expect(workingDaysBetween('2026-12-31', '2027-01-04')).toBe(2);
    expect(workingDaysBetween('2025-12-29', '2026-01-01')).toBe(3);
    expect(workingDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('crosses daylight saving changes by calendar day', () => {
    expect(workingDaysBetween('2026-10-02', '2026-10-06')).toBe(2);
    expect(workingDaysBetween('2026-04-03', '2026-04-07')).toBe(2);
    expect(workingDaysBetween('2026-03-27', '2026-03-31')).toBe(2);
  });

  it('counts a whole year', () => {
    expect(workingDaysBetween('2025-12-31', '2026-12-31')).toBe(261);
  });

  it('is never negative', () => {
    expect(workingDaysBetween('2026-11-20', '2026-11-16')).toBe(0);
  });
});

describe('compact dates', () => {
  it('shows d MMM within the year of today, and adds the year otherwise', () => {
    expect(formatCompactDate('2026-11-12', '2026-11-16')).toBe('12 Nov');
    expect(formatCompactDate('2025-12-30', '2026-01-02')).toBe('30 Dec 2025');
    expect(formatCompactDate('2027-01-02', '2026-12-30')).toBe('2 Jan 2027');
  });

  it('adds the time from a local date-time or a log timestamp', () => {
    expect(formatCompactDateTime('2026-11-14T09:12:45', '2026-11-16')).toBe('14 Nov 09:12');
    expect(formatCompactDateTime('2026-11-14 09:12', '2026-11-16')).toBe('14 Nov 09:12');
    expect(formatCompactDateTime('2025-11-14 09:12', '2026-11-16')).toBe('14 Nov 2025 09:12');
  });
});
