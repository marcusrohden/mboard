import { describe, expect, it } from 'vitest';
import { COLUMNS, DEFAULT_AGE_THRESHOLDS, EMPTY_FILTER, isFilterActive, type Status, type TaskId } from '../../domain';
import {
  beforeIdAfterDrop,
  buildColumnViews,
  columnCountLabel,
  columnOf,
  resolveDrop,
  topOfColumnBeforeId,
  type ColumnArrangement,
} from './board-view';
import { newestCommentsFirst } from './comment-order';
import { filterReducer } from './filters';
import { describeAge, formatDate, formatDateTime, formatLogTime } from './format';
import { buildTask, TEST_TODAY } from '../testing/builders';

describe('filterReducer', () => {
  it('toggles projects, including No project, on and off', () => {
    const on = filterReducer(EMPTY_FILTER, { type: 'toggleProject', project: null });
    expect(on.projects.has(null)).toBe(true);
    const off = filterReducer(on, { type: 'toggleProject', project: null });
    expect(off.projects.size).toBe(0);
  });

  it('never mutates the previous criteria', () => {
    filterReducer(EMPTY_FILTER, { type: 'toggleProject', project: 'Acme' });
    expect(EMPTY_FILTER.projects.size).toBe(0);
  });

  it('swaps a renamed project for its new name, matched ignoring case, leaving the rest alone', () => {
    const chosen = filterReducer(filterReducer(EMPTY_FILTER, { type: 'toggleProject', project: 'acme' }), {
      type: 'toggleProject',
      project: null,
    });
    const renamed = filterReducer(chosen, { type: 'renameProject', from: 'Acme', to: 'Globex' });
    expect([...renamed.projects]).toEqual(['Globex', null]);
    expect(filterReducer(chosen, { type: 'renameProject', from: 'Beta', to: 'Gamma' }).projects).toBe(chosen.projects);
  });

  it('makes the criteria active and clears them again', () => {
    const narrowed = filterReducer(filterReducer(EMPTY_FILTER, { type: 'setDue', due: 'overdue' }), {
      type: 'setStaleOnly',
      staleOnly: true,
    });
    expect(isFilterActive(narrowed)).toBe(true);
    expect(isFilterActive(filterReducer(narrowed, { type: 'clear' }))).toBe(false);
  });
});

describe('buildColumnViews', () => {
  const tasks = [
    buildTask({ title: 'Alpha', status: 'To do', project: 'Acme', order: 2 }),
    buildTask({ title: 'Beta', status: 'To do', project: 'Other', order: 1 }),
    buildTask({ title: 'Gamma', status: 'Done', order: 1 }),
    buildTask({ title: 'Old', status: 'Done', isArchived: true }),
    buildTask({ title: 'Delta', status: 'Internal', project: 'Acme', order: 1 }),
    buildTask({ title: 'Epsilon', status: 'With client', project: 'Other', order: 2 }),
    buildTask({ title: 'Zeta', status: 'With client', project: 'Acme', order: 1 }),
  ];

  it('builds the five columns in board order', () => {
    const views = buildColumnViews(tasks, EMPTY_FILTER, TEST_TODAY, DEFAULT_AGE_THRESHOLDS);
    expect(views.map((view) => view.status)).toEqual(['To do', 'In progress', 'Internal', 'With client', 'Done']);
  });

  it('sorts each column and counts totals without archived tasks', () => {
    const views = buildColumnViews(tasks, EMPTY_FILTER, TEST_TODAY, DEFAULT_AGE_THRESHOLDS);
    expect(views.map((view) => view.visible.map((task) => task.title))).toEqual([
      ['Beta', 'Alpha'],
      [],
      ['Delta'],
      ['Zeta', 'Epsilon'],
      ['Gamma'],
    ]);
    expect(views.map((view) => view.total)).toEqual([2, 0, 1, 2, 1]);
  });

  it('shows "shown of total" in every column that is narrowed', () => {
    const criteria = filterReducer(EMPTY_FILTER, { type: 'toggleProject', project: 'Acme' });
    const labels = buildColumnViews(tasks, criteria, TEST_TODAY, DEFAULT_AGE_THRESHOLDS).map(columnCountLabel);
    expect(labels).toEqual(['1 of 2', '0', '1', '1 of 2', '0 of 1']);
  });

  it('narrows the visible tasks but keeps the totals', () => {
    const criteria = filterReducer(EMPTY_FILTER, { type: 'toggleProject', project: 'Acme' });
    const [todo] = buildColumnViews(tasks, criteria, TEST_TODAY, DEFAULT_AGE_THRESHOLDS);
    expect(todo?.visible.map((task) => task.title)).toEqual(['Alpha']);
    expect(todo?.total).toBe(2);
    expect(columnCountLabel(todo!)).toBe('1 of 2');
  });

  it('shows only the total when nothing is hidden', () => {
    const [todo] = buildColumnViews(tasks, EMPTY_FILTER, TEST_TODAY, DEFAULT_AGE_THRESHOLDS);
    expect(columnCountLabel(todo!)).toBe('2');
  });
});

describe('placing a task', () => {
  const column = [
    buildTask({ title: 'First', status: 'In progress', order: 1 }),
    buildTask({ title: 'Second', status: 'In progress', order: 2 }),
  ];

  it('puts a button-moved task above the first other task in the column', () => {
    const moving = buildTask({ title: 'Mover', status: 'To do' });
    expect(topOfColumnBeforeId([...column, moving], 'In progress', moving.id)).toBe(column[0]?.id);
  });

  it('finds the top of Internal and With client too', () => {
    const waiting = [
      buildTask({ title: 'Waiting', status: 'With client', order: 1 }),
      buildTask({ title: 'Team', status: 'Internal', order: 1 }),
    ];
    expect(topOfColumnBeforeId(waiting, 'With client', 'tasks/x.md')).toBe(waiting[0]?.id);
    expect(topOfColumnBeforeId(waiting, 'Internal', 'tasks/x.md')).toBe(waiting[1]?.id);
  });

  it('skips the moved task itself and returns null for an empty column', () => {
    expect(topOfColumnBeforeId(column, 'In progress', column[0]!.id)).toBe(column[1]?.id);
    expect(topOfColumnBeforeId(column, 'Done', 'tasks/x.md')).toBeNull();
  });

  it('finds the task a dropped one now sits above', () => {
    expect(beforeIdAfterDrop(['a', 'b', 'c'], 'a')).toBe('b');
    expect(beforeIdAfterDrop(['a', 'b', 'c'], 'c')).toBeNull();
    expect(beforeIdAfterDrop(['a'], 'a')).toBeNull();
    expect(beforeIdAfterDrop(['a'], 'missing')).toBeNull();
  });
});

function arranged(columns: Partial<Record<Status, TaskId[]>>): ColumnArrangement {
  const arrangement: ColumnArrangement = {
    'To do': [],
    'In progress': [],
    Internal: [],
    'With client': [],
    Done: [],
  };
  for (const status of COLUMNS) arrangement[status] = columns[status] ?? [];
  return arrangement;
}

describe('columnOf', () => {
  it('names the column that holds the task', () => {
    const arrangement = arranged({ 'To do': ['a'], Internal: ['b', 'c'], Done: ['d'] });
    expect(columnOf(arrangement, 'a')).toBe('To do');
    expect(columnOf(arrangement, 'c')).toBe('Internal');
    expect(columnOf(arrangement, 'd')).toBe('Done');
  });

  it('follows the task as a drag moves it into another column', () => {
    const before = arranged({ 'To do': ['a', 'b'], 'In progress': ['c'] });
    const during = arranged({ 'To do': ['a'], 'In progress': ['b', 'c'] });
    expect(columnOf(before, 'b')).toBe('To do');
    expect(columnOf(during, 'b')).toBe('In progress');
  });

  it('is null for a task no column holds', () => {
    expect(columnOf(arranged({ 'To do': ['a'] }), 'missing')).toBeNull();
  });
});

describe('resolveDrop', () => {
  const original = arranged({
    'To do': ['a', 'b', 'c'],
    'In progress': ['d'],
    Internal: ['e'],
    'With client': ['f', 'g'],
  });

  it('reports the column and the task the dropped one now sits above', () => {
    const arrangement = arranged({
      'To do': ['a', 'c'],
      'In progress': ['d', 'b'],
      Internal: ['e'],
      'With client': ['f', 'g'],
    });
    expect(resolveDrop(original, arrangement, 'b')).toEqual({ status: 'In progress', beforeId: null });
    const intoMiddle = arranged({
      'To do': ['a', 'c'],
      'In progress': ['b', 'd'],
      Internal: ['e'],
      'With client': ['f', 'g'],
    });
    expect(resolveDrop(original, intoMiddle, 'b')).toEqual({ status: 'In progress', beforeId: 'd' });
  });

  it('reports a drop into Internal and into With client', () => {
    const intoInternal = arranged({
      'To do': ['a', 'c'],
      'In progress': ['d'],
      Internal: ['b', 'e'],
      'With client': ['f', 'g'],
    });
    expect(resolveDrop(original, intoInternal, 'b')).toEqual({ status: 'Internal', beforeId: 'e' });
    const intoWithClient = arranged({ 'To do': ['a', 'b', 'c'], Internal: ['e'], 'With client': ['f', 'g', 'd'] });
    expect(resolveDrop(original, intoWithClient, 'd')).toEqual({ status: 'With client', beforeId: null });
  });

  it('reports a drop from With client to Internal and on to Done', () => {
    const toInternal = arranged({
      'To do': ['a', 'b', 'c'],
      'In progress': ['d'],
      Internal: ['e', 'g'],
      'With client': ['f'],
    });
    expect(resolveDrop(original, toInternal, 'g')).toEqual({ status: 'Internal', beforeId: null });
    const toDone = arranged({
      'To do': ['a', 'b', 'c'],
      'In progress': ['d'],
      Internal: [],
      'With client': ['f', 'g'],
      Done: ['e'],
    });
    expect(resolveDrop(original, toDone, 'e')).toEqual({ status: 'Done', beforeId: null });
  });

  it('reports a reorder within a column', () => {
    const arrangement = arranged({
      'To do': ['c', 'a', 'b'],
      'In progress': ['d'],
      Internal: ['e'],
      'With client': ['f', 'g'],
    });
    expect(resolveDrop(original, arrangement, 'c')).toEqual({ status: 'To do', beforeId: 'a' });
    const withinWithClient = arranged({
      'To do': ['a', 'b', 'c'],
      'In progress': ['d'],
      Internal: ['e'],
      'With client': ['g', 'f'],
    });
    expect(resolveDrop(original, withinWithClient, 'g')).toEqual({ status: 'With client', beforeId: 'f' });
  });

  it('reports nothing when the task ends where it began', () => {
    expect(resolveDrop(original, original, 'b')).toBeNull();
    expect(resolveDrop(original, original, 'c')).toBeNull();
  });

  it('reports nothing when the task is in no column', () => {
    expect(resolveDrop(original, original, 'zzz')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats dates and times', () => {
    expect(formatDate('2026-11-20')).toBe('20 Nov 2026');
    expect(formatDateTime('2026-11-16T14:03:12')).toBe('16 Nov 2026, 14:03');
    expect(formatLogTime('2026-11-16 14:03')).toBe('16 Nov 2026, 14:03');
    expect(formatLogTime('')).toBe('');
  });

  it('describes the age of a task with both timestamps, the working days and the tier', () => {
    const task = buildTask({ created: '2026-11-12T08:00:00', updated: '2026-11-12T09:12:30' });
    expect(describeAge(task, TEST_TODAY, DEFAULT_AGE_THRESHOLDS)).toBe(
      'Created 12 Nov 08:00 · Updated 12 Nov 09:12 — 2 working days, Needs a nudge',
    );
    expect(describeAge({ ...task, updated: '2026-11-13T17:00:00' }, TEST_TODAY, DEFAULT_AGE_THRESHOLDS)).toBe(
      'Created 12 Nov 08:00 · Updated 13 Nov 17:00 — 1 working day, On track',
    );
    expect(
      describeAge(
        { ...task, created: '2025-12-30T08:00:00', status: 'Done', updated: `${TEST_TODAY}T09:00:00` },
        TEST_TODAY,
        DEFAULT_AGE_THRESHOLDS,
      ),
    ).toBe('Created 30 Dec 2025 08:00 · Updated 16 Nov 09:00 — 0 working days, Complete');
  });
});

describe('newestCommentsFirst', () => {
  it('puts the newest comment first, the later of two from the same minute first, and undated ones last', () => {
    const comments = [
      { at: '2026-11-12 10:00', text: 'Middle' },
      { at: '', text: 'Undated' },
      { at: '2026-11-14 09:00', text: 'Newest, added first' },
      { at: '2026-11-10 08:00', text: 'Oldest' },
      { at: '2026-11-14 09:00', text: 'Newest, added second' },
    ];
    expect(newestCommentsFirst(comments).map((comment) => comment.text)).toEqual([
      'Newest, added second',
      'Newest, added first',
      'Middle',
      'Oldest',
      'Undated',
    ]);
  });

  it('leaves the comments it was given in their order', () => {
    const comments = [
      { at: '2026-11-10 08:00', text: 'Older' },
      { at: '2026-11-12 10:00', text: 'Newer' },
    ];
    newestCommentsFirst(comments);
    expect(comments.map((comment) => comment.text)).toEqual(['Older', 'Newer']);
  });
});
