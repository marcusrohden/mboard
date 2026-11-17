import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGE_THRESHOLDS,
  ageLabel,
  ageThresholdsProblem,
  isStale,
  levelForDays,
  sanitiseAgeThresholds,
  staleDays,
  stalenessOf,
  type AgeThresholds,
} from './staleness';

const DEFAULTS: AgeThresholds = DEFAULT_AGE_THRESHOLDS;

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

describe('age thresholds', () => {
  it('default to amber from 2, orange from 4 and red from 6 working days', () => {
    expect(DEFAULT_AGE_THRESHOLDS).toEqual({ nudgeFrom: 2, stallingFrom: 4, staleFrom: 6 });
  });

  it('must be whole numbers of working days from 1 to 99', () => {
    expect(ageThresholdsProblem({ nudgeFrom: 1, stallingFrom: 50, staleFrom: 99 })).toBeNull();
    const outOfRange = 'Each age colour starts at a whole number of working days from 1 to 99.';
    expect(ageThresholdsProblem({ nudgeFrom: 0, stallingFrom: 4, staleFrom: 6 })).toBe(outOfRange);
    expect(ageThresholdsProblem({ nudgeFrom: 2, stallingFrom: 4, staleFrom: 100 })).toBe(outOfRange);
    expect(ageThresholdsProblem({ nudgeFrom: 2.5, stallingFrom: 4, staleFrom: 6 })).toBe(outOfRange);
    expect(ageThresholdsProblem({ nudgeFrom: Number.NaN, stallingFrom: 4, staleFrom: 6 })).toBe(outOfRange);
  });

  it('must start each tier after the one before it', () => {
    const order = 'Needs a nudge must start before Stalling, and Stalling before Stale.';
    expect(ageThresholdsProblem({ nudgeFrom: 4, stallingFrom: 4, staleFrom: 6 })).toBe(order);
    expect(ageThresholdsProblem({ nudgeFrom: 2, stallingFrom: 7, staleFrom: 6 })).toBe(order);
  });

  it('read saved values, falling back to the defaults as a whole when they are not valid', () => {
    expect(sanitiseAgeThresholds({ nudgeFrom: 3, stallingFrom: 5, staleFrom: 10 })).toEqual({
      nudgeFrom: 3,
      stallingFrom: 5,
      staleFrom: 10,
    });
    expect(sanitiseAgeThresholds({ nudgeFrom: 3, stallingFrom: '5', staleFrom: 10 })).toEqual(DEFAULTS);
    expect(sanitiseAgeThresholds({ nudgeFrom: 6, stallingFrom: 5, staleFrom: 10 })).toEqual(DEFAULTS);
    expect(sanitiseAgeThresholds(undefined)).toEqual(DEFAULTS);
    expect(sanitiseAgeThresholds('fast')).toEqual(DEFAULTS);
  });
});

describe('levelForDays', () => {
  it.each([
    [0, 'green'],
    [1, 'green'],
    [2, 'amber'],
    [3, 'amber'],
    [4, 'orange'],
    [5, 'orange'],
    [6, 'red'],
    [30, 'red'],
  ] as const)('is %i working days -> %s with the defaults', (days, level) => {
    expect(levelForDays(days, DEFAULTS)).toBe(level);
  });

  it('follows changed thresholds', () => {
    const relaxed = { nudgeFrom: 5, stallingFrom: 10, staleFrom: 20 };
    expect(levelForDays(4, relaxed)).toBe('green');
    expect(levelForDays(5, relaxed)).toBe('amber');
    expect(levelForDays(10, relaxed)).toBe('orange');
    expect(levelForDays(20, relaxed)).toBe('red');
  });
});

describe('stalenessOf', () => {
  it('gives each tier of a live task with its name', () => {
    expect(stalenessOf({ ...live, updated: '2026-11-13T08:00:00' }, MONDAY, DEFAULTS)).toEqual({
      days: 1,
      level: 'green',
      tier: 'On track',
    });
    expect(stalenessOf({ ...live, updated: '2026-11-12T08:00:00' }, MONDAY, DEFAULTS)).toEqual({
      days: 2,
      level: 'amber',
      tier: 'Needs a nudge',
    });
    expect(stalenessOf({ ...live, updated: '2026-11-10T08:00:00' }, MONDAY, DEFAULTS)).toEqual({
      days: 4,
      level: 'orange',
      tier: 'Stalling',
    });
    expect(stalenessOf({ ...live, updated: '2026-11-06T08:00:00' }, MONDAY, DEFAULTS)).toEqual({
      days: 6,
      level: 'red',
      tier: 'Stale',
    });
  });

  it('applies to In progress tasks too', () => {
    expect(
      stalenessOf({ status: 'In progress', isArchived: false, updated: '2026-11-01T08:00:00' }, MONDAY, DEFAULTS).level,
    ).toBe('red');
  });

  it('is grey for tasks in Done and archived tasks, and still counts the days', () => {
    expect(
      stalenessOf({ status: 'Done', isArchived: false, updated: '2026-11-06T08:00:00' }, MONDAY, DEFAULTS),
    ).toEqual({
      days: 6,
      level: 'grey',
      tier: 'Complete',
    });
    expect(stalenessOf({ status: 'Done', isArchived: true, updated: '2026-11-13T08:00:00' }, MONDAY, DEFAULTS)).toEqual(
      {
        days: 1,
        level: 'grey',
        tier: 'Archived',
      },
    );
    expect(
      stalenessOf({ status: 'To do', isArchived: true, updated: '2026-01-01T08:00:00' }, MONDAY, DEFAULTS).level,
    ).toBe('grey');
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
