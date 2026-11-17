import { describe, expect, it } from 'vitest';
import {
  FIRST_ORDER,
  columnTasks,
  compareArchivedTasks,
  compareColumnTasks,
  orderForInsertBefore,
  orderForTopOfColumn,
} from './ordering';
import { makeTask } from './testHelpers';

const ordered = (id: string, order: number | null, extra = {}) =>
  makeTask({ id: `tasks/${id}.md`, title: id, order, ...extra });

describe('compareColumnTasks', () => {
  it('sorts order ascending with missing orders last', () => {
    const tasks = [ordered('none', null), ordered('b', 2), ordered('a', 1)];
    expect(tasks.sort(compareColumnTasks).map((task) => task.title)).toEqual(['a', 'b', 'none']);
  });

  it('breaks ties by created descending, then title', () => {
    const tasks = [
      ordered('old', null, { created: '2026-11-01T09:00:00' }),
      ordered('new', null, { created: '2026-11-05T09:00:00' }),
      ordered('b-same', null, { created: '2026-11-03T09:00:00' }),
      ordered('a-same', null, { created: '2026-11-03T09:00:00' }),
    ];
    expect(tasks.sort(compareColumnTasks).map((task) => task.title)).toEqual(['new', 'a-same', 'b-same', 'old']);
  });

  it('breaks equal numeric orders by created descending', () => {
    const tasks = [
      ordered('old', 1, { created: '2026-11-01T09:00:00' }),
      ordered('new', 1, { created: '2026-11-02T09:00:00' }),
    ];
    expect(tasks.sort(compareColumnTasks).map((task) => task.title)).toEqual(['new', 'old']);
  });
});

describe('columnTasks', () => {
  it('keeps live tasks of the column in display order', () => {
    const tasks = [
      ordered('two', 2),
      ordered('one', 1),
      ordered('other column', 1, { status: 'Done' }),
      ordered('archived', 0, { isArchived: true }),
    ];
    expect(columnTasks(tasks, 'To do').map((task) => task.title)).toEqual(['one', 'two']);
  });
});

describe('orderForTopOfColumn', () => {
  it('is 1 for an empty column and for a column with no orders', () => {
    expect(orderForTopOfColumn([])).toBe(FIRST_ORDER);
    expect(orderForTopOfColumn([ordered('a', null)])).toBe(FIRST_ORDER);
  });

  it('is one less than the smallest order', () => {
    expect(orderForTopOfColumn([ordered('a', 3), ordered('b', 5), ordered('c', null)])).toBe(2);
    expect(orderForTopOfColumn([ordered('a', 1)])).toBe(0);
  });
});

describe('orderForInsertBefore', () => {
  const column = [ordered('a', 1), ordered('b', 2), ordered('c', 4)];

  it('puts a task between two neighbours at their midpoint', () => {
    expect(orderForInsertBefore(column, 'tasks/x.md', 'tasks/c.md')).toEqual({ kind: 'single', order: 3 });
  });

  it('puts a task at the top one below the first order', () => {
    expect(orderForInsertBefore(column, 'tasks/x.md', 'tasks/a.md')).toEqual({ kind: 'single', order: 0 });
  });

  it('puts a task at the end one above the last order when beforeId is null', () => {
    expect(orderForInsertBefore(column, 'tasks/x.md', null)).toEqual({ kind: 'single', order: 5 });
  });

  it('handles an empty column', () => {
    expect(orderForInsertBefore([], 'tasks/x.md', null)).toEqual({ kind: 'single', order: 1 });
  });

  it('ignores the moved task when it is already in the column', () => {
    expect(orderForInsertBefore(column, 'tasks/b.md', 'tasks/c.md')).toEqual({ kind: 'single', order: 2.5 });
    expect(orderForInsertBefore(column, 'tasks/c.md', null)).toEqual({ kind: 'single', order: 3 });
  });

  it('accepts a gap of exactly the minimum and renumbers below it', () => {
    const wide = [ordered('a', 1), ordered('b', 1 + 2e-6)];
    expect(orderForInsertBefore(wide, 'tasks/x.md', 'tasks/b.md')).toMatchObject({ kind: 'single' });
    const narrow = [ordered('a', 1), ordered('b', 1 + 5e-7)];
    expect(orderForInsertBefore(narrow, 'tasks/x.md', 'tasks/b.md').kind).toBe('renumber');
  });

  it('renumbers the column 1..n, listing only changed tasks and always the moved task', () => {
    const tight = [ordered('a', 1), ordered('b', 1 + 5e-7), ordered('c', 3)];
    const placement = orderForInsertBefore(tight, 'tasks/x.md', 'tasks/b.md');
    expect(placement).toEqual({
      kind: 'renumber',
      assignments: [
        { id: 'tasks/x.md', order: 2 },
        { id: 'tasks/b.md', order: 3 },
        { id: 'tasks/c.md', order: 4 },
      ],
    });
  });

  it('renumbers when equal orders leave no gap', () => {
    const equal = [
      ordered('a', 1, { created: '2026-11-02T09:00:00' }),
      ordered('b', 1, { created: '2026-11-01T09:00:00' }),
    ];
    expect(orderForInsertBefore(equal, 'tasks/x.md', 'tasks/b.md').kind).toBe('renumber');
  });

  it('inserts before a task with no order after numbered ones with a single write', () => {
    const mixed = [ordered('a', 1), ordered('b', null)];
    expect(orderForInsertBefore(mixed, 'tasks/x.md', 'tasks/b.md')).toEqual({ kind: 'single', order: 2 });
    expect(orderForInsertBefore(mixed, 'tasks/x.md', 'tasks/a.md')).toEqual({ kind: 'single', order: 0 });
  });

  it('renumbers everything when the new position follows a task with no order', () => {
    const unnumbered = [
      ordered('a', null, { created: '2026-11-03T09:00:00' }),
      ordered('b', null, { created: '2026-11-02T09:00:00' }),
    ];
    expect(orderForInsertBefore(unnumbered, 'tasks/x.md', null)).toEqual({
      kind: 'renumber',
      assignments: [
        { id: 'tasks/a.md', order: 1 },
        { id: 'tasks/b.md', order: 2 },
        { id: 'tasks/x.md', order: 3 },
      ],
    });
  });

  it('rejects a beforeId that is not in the column', () => {
    expect(() => orderForInsertBefore(column, 'tasks/x.md', 'tasks/missing.md')).toThrow(/isn't in the column/);
  });
});

describe('a column merged from legacy columns', () => {
  const merged = [
    ordered('from to do 1', 1, { status: 'With client', created: '2026-11-01T09:00:00' }),
    ordered('from to do 2', 2, { status: 'With client', created: '2026-11-01T10:00:00' }),
    ordered('from in progress 1', 1, { status: 'With client', created: '2026-11-03T09:00:00' }),
    ordered('from in progress 2', 2, { status: 'With client', created: '2026-11-03T10:00:00' }),
    ordered('unordered', null, { status: 'With client' }),
  ];

  it('keeps each order and breaks the duplicates by created descending', () => {
    expect(columnTasks(merged, 'With client').map((task) => task.title)).toEqual([
      'from in progress 1',
      'from to do 1',
      'from in progress 2',
      'from to do 2',
      'unordered',
    ]);
  });

  it('puts a button move at the top with a single order', () => {
    expect(orderForTopOfColumn(merged)).toBe(0);
  });

  it('renumbers the column for a drop between two equal orders', () => {
    expect(orderForInsertBefore(merged, 'tasks/x.md', 'tasks/from to do 1.md')).toEqual({
      kind: 'renumber',
      assignments: [
        { id: 'tasks/x.md', order: 2 },
        { id: 'tasks/from to do 1.md', order: 3 },
        { id: 'tasks/from in progress 2.md', order: 4 },
        { id: 'tasks/from to do 2.md', order: 5 },
        { id: 'tasks/unordered.md', order: 6 },
      ],
    });
  });

  it('drops between different orders with a single write', () => {
    expect(orderForInsertBefore(merged, 'tasks/x.md', 'tasks/from in progress 2.md')).toEqual({
      kind: 'single',
      order: 1.5,
    });
  });
});

describe('compareArchivedTasks', () => {
  it('sorts archived date descending with missing dates last', () => {
    const tasks = [
      makeTask({ id: 'archive/none.md', title: 'none' }),
      makeTask({ id: 'archive/old.md', title: 'old', archivedAt: '2026-11-01T09:00:00' }),
      makeTask({ id: 'archive/new.md', title: 'new', archivedAt: '2026-11-09T09:00:00' }),
    ];
    expect(tasks.sort(compareArchivedTasks).map((task) => task.title)).toEqual(['new', 'old', 'none']);
  });
});
