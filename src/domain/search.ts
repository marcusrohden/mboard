import { dueStatus } from './due';
import type { LocalDate, Task } from './model';
import { isStale, stalenessOf, type AgeThresholds } from './staleness';
import { endOfWeek } from './time';

export type DueFilter = 'any' | 'overdue' | 'today' | 'thisWeek' | 'none';

/** The archived view's criteria: search and projects. `null` in `projects` means No project. */
export interface ArchiveFilterCriteria {
  query: string;
  projects: ReadonlySet<string | null>;
}

/** The board's criteria. All of them combine with AND, and an empty set or `any` matches everything. */
export interface FilterCriteria extends ArchiveFilterCriteria {
  due: DueFilter;
  staleOnly: boolean;
}

export const EMPTY_ARCHIVE_FILTER: ArchiveFilterCriteria = {
  query: '',
  projects: new Set(),
};

export const EMPTY_FILTER: FilterCriteria = {
  ...EMPTY_ARCHIVE_FILTER,
  due: 'any',
  staleOnly: false,
};

/** Splits a search query on whitespace into lower-case terms. */
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== '');
}

/** Whether every term appears, ignoring case, in the title, description, a comment or the project. */
export function matchesSearch(
  task: Pick<Task, 'title' | 'description' | 'comments' | 'project'>,
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return true;
  const haystack = [task.title, task.description, ...task.comments.map((comment) => comment.text), task.project ?? '']
    .join('\n')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function matchesArchiveCriteria(task: Task, criteria: ArchiveFilterCriteria, terms: readonly string[]): boolean {
  const { projects } = criteria;
  return matchesSearch(task, terms) && (projects.size === 0 || projects.has(task.project));
}

function matchesDueFilter(due: Task['due'], filter: DueFilter, today: LocalDate): boolean {
  switch (filter) {
    case 'any':
      return true;
    case 'none':
      return due === null;
    case 'overdue':
      return dueStatus(due, today) === 'overdue';
    case 'today':
      return dueStatus(due, today) === 'today';
    case 'thisWeek':
      return due !== null && due >= today && due <= endOfWeek(today);
  }
}

/** Whether any criterion is set, which is when the board shows its Clear control. */
export function isFilterActive(criteria: ArchiveFilterCriteria | FilterCriteria): boolean {
  const hasBoardOnlyCriteria = 'due' in criteria && (criteria.due !== 'any' || criteria.staleOnly);
  return searchTerms(criteria.query).length > 0 || criteria.projects.size > 0 || hasBoardOnlyCriteria;
}

/** Tasks that satisfy the board's search and filters, with Stale only judged by `thresholds`. Keeps the input order. */
export function filterBoardTasks(
  tasks: readonly Task[],
  criteria: FilterCriteria,
  today: LocalDate,
  thresholds: AgeThresholds,
): Task[] {
  const terms = searchTerms(criteria.query);
  return tasks.filter(
    (task) =>
      matchesArchiveCriteria(task, criteria, terms) &&
      matchesDueFilter(task.due, criteria.due, today) &&
      (!criteria.staleOnly || isStale(stalenessOf(task, today, thresholds))),
  );
}

/** Tasks that satisfy the archived view's search and Projects. Keeps the input order. */
export function filterArchivedTasks(tasks: readonly Task[], criteria: ArchiveFilterCriteria): Task[] {
  const terms = searchTerms(criteria.query);
  return tasks.filter((task) => matchesArchiveCriteria(task, criteria, terms));
}
