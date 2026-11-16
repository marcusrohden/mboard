import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, isFilterActive } from '../../domain';
import { beforeIdAfterDrop, buildColumnViews, columnCountLabel, resolveDrop, topOfColumnBeforeId } from './board-view';
import { filterReducer } from './filters';
import { formatDate, formatDateTime, formatLogTime } from './format';
import { buildTask, TEST_TODAY } from '../testing/builders';

describe('filterReducer', () => {
  it('toggles projects, including No project, on and off', () => {
    const on = filterReducer(EMPTY_FILTER, { type: 'toggleProject', project: null });
    expect(on.projects.has(null)).toBe(true);
    const off = filterReducer(on, { type: 'toggleProject', project: null });
    expect(off.projects.size).toBe(0);
  });

  it('never mutates the previous criteria', () => {
    filterReducer(EMPTY_FILTER, { type: 'toggleResponsibility', responsibility: 'Client' });
    expect(EMPTY_FILTER.responsibilities.size).toBe(0);
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
  ];

  it('sorts each column and counts totals without archived tasks', () => {
    const views = buildColumnViews(tasks, EMPTY_FILTER, TEST_TODAY);
    expect(views.map((view) => view.status)).toEqual(['To do', 'In progress', 'Done']);
    expect(views[0]?.visible.map((task) => task.title)).toEqual(['Beta', 'Alpha']);
    expect(views[2]?.total).toBe(1);
  });

  it('narrows the visible tasks but keeps the totals', () => {
    const criteria = filterReducer(EMPTY_FILTER, { type: 'toggleProject', project: 'Acme' });
    const [todo] = buildColumnViews(tasks, criteria, TEST_TODAY);
    expect(todo?.visible.map((task) => task.title)).toEqual(['Alpha']);
    expect(todo?.total).toBe(2);
    expect(columnCountLabel(todo!)).toBe('1 of 2');
  });

  it('shows only the total when nothing is hidden', () => {
    const [todo] = buildColumnViews(tasks, EMPTY_FILTER, TEST_TODAY);
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

describe('resolveDrop', () => {
  const original = { 'To do': ['a', 'b', 'c'], 'In progress': ['d'], Done: [] as string[] };

  it('reports the column and the task the dropped one now sits above', () => {
    const arrangement = { 'To do': ['a', 'c'], 'In progress': ['d', 'b'], Done: [] as string[] };
    expect(resolveDrop(original, arrangement, 'b')).toEqual({ status: 'In progress', beforeId: null });
    const intoMiddle = { 'To do': ['a', 'c'], 'In progress': ['b', 'd'], Done: [] as string[] };
    expect(resolveDrop(original, intoMiddle, 'b')).toEqual({ status: 'In progress', beforeId: 'd' });
  });

  it('reports a reorder within a column', () => {
    const arrangement = { 'To do': ['c', 'a', 'b'], 'In progress': ['d'], Done: [] as string[] };
    expect(resolveDrop(original, arrangement, 'c')).toEqual({ status: 'To do', beforeId: 'a' });
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
});
