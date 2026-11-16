import { describe, expect, it } from 'vitest';
import { levelForDays, staleDays, stalenessOf, staleLabel } from './staleness';

const live = { status: 'To do', isArchived: false } as const;

describe('staleDays', () => {
  it('counts local calendar days, not elapsed hours', () => {
    expect(staleDays('2026-11-15T23:59:59', '2026-11-16')).toBe(1);
    expect(staleDays('2026-11-15T00:00:00', '2026-11-15')).toBe(0);
  });

  it('is never negative', () => {
    expect(staleDays('2026-11-20T10:00:00', '2026-11-16')).toBe(0);
  });

  it('crosses month and year boundaries', () => {
    expect(staleDays('2026-10-30T12:00:00', '2026-11-02')).toBe(3);
    expect(staleDays('2026-12-28T12:00:00', '2027-01-04')).toBe(7);
  });

  it('crosses daylight saving boundaries by calendar day', () => {
    expect(staleDays('2026-10-03T23:30:00', '2026-10-06')).toBe(3);
    expect(staleDays('2026-04-03T00:30:00', '2026-04-10')).toBe(7);
  });
});

describe('levelForDays', () => {
  it.each([
    [0, 'none'],
    [2, 'none'],
    [3, 'amber'],
    [6, 'amber'],
    [7, 'red'],
    [30, 'red'],
  ] as const)('is %i days -> %s', (days, level) => {
    expect(levelForDays(days)).toBe(level);
  });
});

describe('stalenessOf', () => {
  it('is amber at 3 days and red at 7 days for a live task', () => {
    expect(stalenessOf({ ...live, updated: '2026-11-13T08:00:00' }, '2026-11-16')).toEqual({ days: 3, level: 'amber' });
    expect(stalenessOf({ ...live, updated: '2026-11-09T08:00:00' }, '2026-11-16')).toEqual({ days: 7, level: 'red' });
  });

  it('is none below 3 days', () => {
    expect(stalenessOf({ ...live, updated: '2026-11-14T08:00:00' }, '2026-11-16').level).toBe('none');
  });

  it('applies to In progress tasks too', () => {
    expect(stalenessOf({ status: 'In progress', isArchived: false, updated: '2026-11-01T08:00:00' }, '2026-11-16').level).toBe('red');
  });

  it('is always none in Done and for archived tasks', () => {
    expect(stalenessOf({ status: 'Done', isArchived: false, updated: '2026-01-01T08:00:00' }, '2026-11-16').level).toBe('none');
    expect(stalenessOf({ status: 'Done', isArchived: true, updated: '2026-01-01T08:00:00' }, '2026-11-16').level).toBe('none');
    expect(stalenessOf({ status: 'To do', isArchived: true, updated: '2026-01-01T08:00:00' }, '2026-11-16').level).toBe('none');
  });
});

describe('staleLabel', () => {
  it('shows Nd from 3 days and nothing before', () => {
    expect(staleLabel({ days: 3, level: 'amber' })).toBe('3d');
    expect(staleLabel({ days: 12, level: 'red' })).toBe('12d');
    expect(staleLabel({ days: 2, level: 'none' })).toBeNull();
    expect(staleLabel({ days: 40, level: 'none' })).toBeNull();
  });
});
