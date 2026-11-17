import { describe, expect, it } from 'vitest';
import {
  NUDGE_FROM_WORKING_DAYS,
  STALE_FROM_WORKING_DAYS,
  STALLING_FROM_WORKING_DAYS,
  ageLabel,
  isStale,
  levelForDays,
  staleDays,
  stalenessOf,
} from './staleness';

const MONDAY = '2026-11-16';
const live = { status: 'To do', isArchived: false } as const;

describe('staleDays', () => {
  it('counts working days by local date, not elapsed hours', () => {
    expect(staleDays('2026-11-16T00:00:00', MONDAY)).toBe(0);
    expect(staleDays('2026-11-16T23:59:59', MONDAY)).toBe(0);
    expect(staleDays('2026-11-13T23:59:59', MONDAY)).toBe(1);
    expect(staleDays('2026-11-14T10:00:00', MONDAY)).toBe(1);
  });

  it('is never negative', () => {
    expect(staleDays('2026-11-20T10:00:00', MONDAY)).toBe(0);
  });

  it('crosses month and year ends and daylight saving changes', () => {
    expect(staleDays('2026-10-30T12:00:00', '2026-11-02')).toBe(1);
    expect(staleDays('2026-12-28T12:00:00', '2027-01-04')).toBe(5);
    expect(staleDays('2026-10-02T23:30:00', '2026-10-06')).toBe(2);
  });
});

describe('levelForDays', () => {
  it('keeps the thresholds as named constants', () => {
    expect([NUDGE_FROM_WORKING_DAYS, STALLING_FROM_WORKING_DAYS, STALE_FROM_WORKING_DAYS]).toEqual([2, 4, 6]);
  });

  it.each([
    [0, 'green'],
    [1, 'green'],
    [2, 'amber'],
    [3, 'amber'],
    [4, 'orange'],
    [5, 'orange'],
    [6, 'red'],
    [30, 'red'],
  ] as const)('is %i working days -> %s', (days, level) => {
    expect(levelForDays(days)).toBe(level);
  });
});

describe('stalenessOf', () => {
  it('gives each tier of a live task with its name', () => {
    expect(stalenessOf({ ...live, updated: '2026-11-13T08:00:00' }, MONDAY)).toEqual({
      days: 1,
      level: 'green',
      tier: 'On track',
    });
    expect(stalenessOf({ ...live, updated: '2026-11-12T08:00:00' }, MONDAY)).toEqual({
      days: 2,
      level: 'amber',
      tier: 'Needs a nudge',
    });
    expect(stalenessOf({ ...live, updated: '2026-11-10T08:00:00' }, MONDAY)).toEqual({
      days: 4,
      level: 'orange',
      tier: 'Stalling',
    });
    expect(stalenessOf({ ...live, updated: '2026-11-06T08:00:00' }, MONDAY)).toEqual({
      days: 6,
      level: 'red',
      tier: 'Stale',
    });
  });

  it('applies to In progress tasks too', () => {
    expect(
      stalenessOf({ status: 'In progress', isArchived: false, updated: '2026-11-01T08:00:00' }, MONDAY).level,
    ).toBe('red');
  });

  it('is grey for tasks in Done and archived tasks, and still counts the days', () => {
    expect(stalenessOf({ status: 'Done', isArchived: false, updated: '2026-11-06T08:00:00' }, MONDAY)).toEqual({
      days: 6,
      level: 'grey',
      tier: 'Complete',
    });
    expect(stalenessOf({ status: 'Done', isArchived: true, updated: '2026-11-13T08:00:00' }, MONDAY)).toEqual({
      days: 1,
      level: 'grey',
      tier: 'Archived',
    });
    expect(stalenessOf({ status: 'To do', isArchived: true, updated: '2026-01-01T08:00:00' }, MONDAY).level).toBe(
      'grey',
    );
  });
});

describe('isStale', () => {
  it('is amber or worse, never for Done or archived tasks', () => {
    expect(isStale({ days: 1, level: 'green', tier: 'On track' })).toBe(false);
    expect(isStale({ days: 2, level: 'amber', tier: 'Needs a nudge' })).toBe(true);
    expect(isStale({ days: 4, level: 'orange', tier: 'Stalling' })).toBe(true);
    expect(isStale({ days: 9, level: 'red', tier: 'Stale' })).toBe(true);
    expect(isStale({ days: 9, level: 'grey', tier: 'Complete' })).toBe(false);
  });
});

describe('ageLabel', () => {
  it('is always the working-day count as Nd', () => {
    expect(ageLabel({ days: 0, level: 'green', tier: 'On track' })).toBe('0d');
    expect(ageLabel({ days: 12, level: 'red', tier: 'Stale' })).toBe('12d');
    expect(ageLabel({ days: 40, level: 'grey', tier: 'Archived' })).toBe('40d');
  });
});
