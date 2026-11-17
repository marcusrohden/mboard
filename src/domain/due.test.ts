import { describe, expect, it } from 'vitest';
import { dueChip, dueStatus } from './due';

const TODAY = '2026-11-16';

describe('dueStatus', () => {
  it.each([
    [null, 'none'],
    ['2026-11-15', 'overdue'],
    ['2026-10-31', 'overdue'],
    ['2026-11-16', 'today'],
    ['2026-11-17', 'upcoming'],
    ['2027-01-01', 'upcoming'],
  ] as const)('%s is %s', (due, expected) => {
    expect(dueStatus(due, TODAY)).toBe(expected);
  });

  it('rolls over at midnight when today changes', () => {
    expect(dueStatus('2026-11-16', '2026-11-17')).toBe('overdue');
  });
});

describe('dueChip', () => {
  const live = { status: 'In progress', isArchived: false } as const;

  it('has no chip without a due date', () => {
    expect(dueChip({ ...live, due: null }, TODAY)).toBeNull();
  });

  it('shows an amber Today and a red Overdue', () => {
    expect(dueChip({ ...live, due: '2026-11-16' }, TODAY)).toEqual({ text: 'Today', tone: 'amber' });
    expect(dueChip({ ...live, due: '2026-11-10' }, TODAY)).toEqual({ text: 'Overdue', tone: 'red' });
  });

  it('shows an upcoming date as d MMM in neutral', () => {
    expect(dueChip({ ...live, due: '2026-11-20' }, TODAY)).toEqual({ text: '20 Nov', tone: 'neutral' });
  });

  it('is always neutral, with the date, in Done and when archived', () => {
    expect(dueChip({ status: 'Done', isArchived: false, due: '2026-11-16' }, TODAY)).toEqual({
      text: '16 Nov',
      tone: 'neutral',
    });
    expect(dueChip({ status: 'Done', isArchived: false, due: '2026-11-01' }, TODAY)).toEqual({
      text: '1 Nov',
      tone: 'neutral',
    });
    expect(dueChip({ status: 'Done', isArchived: true, due: '2026-11-01' }, TODAY)).toEqual({
      text: '1 Nov',
      tone: 'neutral',
    });
  });
});
