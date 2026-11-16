import { describe, expect, it } from 'vitest';
import {
  EMPTY_ARCHIVE_FILTER,
  EMPTY_FILTER,
  filterArchivedTasks,
  filterBoardTasks,
  isFilterActive,
  matchesSearch,
  searchTerms,
} from './search';
import type { FilterCriteria } from './search';
import { makeTask } from './testHelpers';

const TODAY = '2026-11-18';

const tasks = [
  makeTask({
    id: 'tasks/Staging build.md',
    title: 'Staging build failing',
    description: 'The pipeline fails at the asset step',
    project: 'Acme website',
    responsibility: 'Client',
    due: '2026-11-20',
    updated: '2026-11-17T09:00:00',
    comments: [{ at: '2026-11-17 09:00', text: 'Asked for the staging credentials' }],
  }),
  makeTask({
    id: 'tasks/Invoice.md',
    title: 'Send invoice',
    project: 'Bookkeeping',
    responsibility: 'Me',
    due: '2026-11-10',
    updated: '2026-11-17T09:00:00',
  }),
  makeTask({
    id: 'tasks/Stale thing.md',
    title: 'Chase supplier',
    project: null,
    responsibility: 'Internal',
    due: '2026-11-18',
    updated: '2026-11-10T09:00:00',
  }),
  makeTask({
    id: 'tasks/Done old.md',
    title: 'Old finished job',
    status: 'Done',
    responsibility: 'Me',
    due: '2026-11-22',
    updated: '2026-10-01T09:00:00',
  }),
  makeTask({
    id: 'tasks/Next week.md',
    title: 'Plan the quarter',
    responsibility: 'Me',
    due: '2026-11-23',
    updated: '2026-11-18T09:00:00',
  }),
];

function titles(filtered: readonly { title: string }[]): string[] {
  return filtered.map((task) => task.title);
}

function board(overrides: Partial<FilterCriteria>): string[] {
  return titles(filterBoardTasks(tasks, { ...EMPTY_FILTER, ...overrides }, TODAY));
}

describe('searchTerms', () => {
  it('splits on any whitespace, lower-cases and drops empties', () => {
    expect(searchTerms('  Staging \t BUILD\n')).toEqual(['staging', 'build']);
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('search', () => {
  it('matches a term in the title, description, a comment or the project, ignoring case', () => {
    expect(board({ query: 'STAGING' })).toEqual(['Staging build failing']);
    expect(board({ query: 'pipeline' })).toEqual(['Staging build failing']);
    expect(board({ query: 'credentials' })).toEqual(['Staging build failing']);
    expect(board({ query: 'bookkeeping' })).toEqual(['Send invoice']);
  });

  it('requires every term, each in any field', () => {
    expect(board({ query: 'acme credentials' })).toEqual(['Staging build failing']);
    expect(board({ query: 'acme invoice' })).toEqual([]);
    expect(board({ query: 'asset staging acme' })).toEqual(['Staging build failing']);
  });

  it('matches everything for an empty query', () => {
    expect(board({ query: '  ' })).toHaveLength(tasks.length);
  });

  it('matchesSearch treats no terms as a match', () => {
    expect(matchesSearch(tasks[0]!, [])).toBe(true);
  });
});

describe('board filters', () => {
  it('projects: matches named projects, and null means No project', () => {
    expect(board({ projects: new Set(['Acme website']) })).toEqual(['Staging build failing']);
    expect(board({ projects: new Set([null]) })).toEqual(['Chase supplier', 'Old finished job', 'Plan the quarter']);
    expect(board({ projects: new Set(['Acme website', 'Bookkeeping']) })).toEqual(['Staging build failing', 'Send invoice']);
  });

  it('responsibilities: matches any selected value', () => {
    expect(board({ responsibilities: new Set(['Client']) })).toEqual(['Staging build failing']);
    expect(board({ responsibilities: new Set(['Client', 'Internal']) })).toEqual(['Staging build failing', 'Chase supplier']);
  });

  it('due overdue: before today', () => {
    expect(board({ due: 'overdue' })).toEqual(['Send invoice']);
  });

  it('due today: equal to today', () => {
    expect(board({ due: 'today' })).toEqual(['Chase supplier']);
  });

  it('due thisWeek: today up to and including the coming Sunday', () => {
    expect(board({ due: 'thisWeek' })).toEqual(['Staging build failing', 'Chase supplier', 'Old finished job']);
  });

  it('due thisWeek on a Sunday includes only that day', () => {
    const sunday = filterBoardTasks(tasks, { ...EMPTY_FILTER, due: 'thisWeek' }, '2026-11-22');
    expect(titles(sunday)).toEqual(['Old finished job']);
  });

  it('due none: no due date', () => {
    const withoutDue = [makeTask({ title: 'No date' }), ...tasks];
    expect(titles(filterBoardTasks(withoutDue, { ...EMPTY_FILTER, due: 'none' }, TODAY))).toEqual(['No date']);
  });

  it('stale only: amber or red, never Done', () => {
    expect(board({ staleOnly: true })).toEqual(['Chase supplier']);
  });

  it('combines filters with AND', () => {
    expect(board({ responsibilities: new Set(['Me']), due: 'overdue' })).toEqual(['Send invoice']);
    expect(board({ query: 'supplier', projects: new Set(['Acme website']) })).toEqual([]);
    expect(board({ responsibilities: new Set(['Internal']), staleOnly: true, projects: new Set([null]), due: 'today' })).toEqual([
      'Chase supplier',
    ]);
  });
});

describe('archived view filters', () => {
  const archived = [
    makeTask({ title: 'Archived A', project: 'Acme website', responsibility: 'Client', due: '2026-01-01', isArchived: true }),
    makeTask({ title: 'Archived B', project: null, responsibility: 'Me', isArchived: true }),
  ];

  it('applies search, projects and responsibilities', () => {
    expect(titles(filterArchivedTasks(archived, { ...EMPTY_ARCHIVE_FILTER, query: 'archived website' }))).toEqual(['Archived A']);
    expect(titles(filterArchivedTasks(archived, { ...EMPTY_ARCHIVE_FILTER, projects: new Set([null]) }))).toEqual(['Archived B']);
    expect(titles(filterArchivedTasks(archived, { ...EMPTY_ARCHIVE_FILTER, responsibilities: new Set(['Client']) }))).toEqual([
      'Archived A',
    ]);
  });

  it('ignores due and stale criteria that are not part of the archived view', () => {
    const withBoardCriteria = { ...EMPTY_FILTER, due: 'today', staleOnly: true } satisfies FilterCriteria;
    expect(filterArchivedTasks(archived, withBoardCriteria)).toHaveLength(2);
  });
});

describe('isFilterActive', () => {
  it('is false for the empty criteria and true when anything is set', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive(EMPTY_ARCHIVE_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, query: ' ' })).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, query: 'x' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, projects: new Set([null]) })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, responsibilities: new Set(['Me']) })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, due: 'overdue' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, staleOnly: true })).toBe(true);
  });
});
