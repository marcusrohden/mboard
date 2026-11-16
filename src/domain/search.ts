import { dueStatus } from './due';
import type { LocalDate, Responsibility, Task } from './model';
import { stalenessOf } from './staleness';
import { endOfWeek } from './time';

export type DueFilter = 'any' | 'overdue' | 'today' | 'thisWeek' | 'none';

/** The archived view's criteria: search, projects and responsibilities. `null` in `projects` means No project. */
export interface ArchiveFilterCriteria {
  query: string;
  projects: ReadonlySet<string | null>;
  responsibilities: ReadonlySet<Responsibility>;
}

/** The board's criteria. All of them combine with AND, and an empty set or `any` matches everything. */
export interface FilterCriteria extends ArchiveFilterCriteria {
  due: DueFilter;
  staleOnly: boolean;
}

export const EMPTY_ARCHIVE_FILTER: ArchiveFilterCriteria = {
  query: '',
  projects: new Set(),
  responsibilities: new Set(),
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
export function matchesSearch(task: Pick<Task, 'title' | 'description' | 'comments' | 'project'>, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = [task.title, task.description, ...task.comments.map((comment) => comment.text), task.project ?? '']
    .join('\n')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function matchesArchiveCriteria(task: Task, criteria: ArchiveFilterCriteria, terms: readonly string[]): boolean {
  const { projects, responsibilities } = criteria;
  return (
    matchesSearch(task, terms) &&
    (projects.size === 0 || projects.has(task.project)) &&
    (responsibilities.size === 0 || responsibilities.has(task.responsibility))
  );
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
  return (
    searchTerms(criteria.query).length > 0 ||
    criteria.projects.size > 0 ||
    criteria.responsibilities.size > 0 ||
    hasBoardOnlyCriteria
  );
}

/** Tasks that satisfy the board's search and filters. Keeps the input order. */
export function filterBoardTasks(tasks: readonly Task[], criteria: FilterCriteria, today: LocalDate): Task[] {
  const terms = searchTerms(criteria.query);
  return tasks.filter(
    (task) =>
      matchesArchiveCriteria(task, criteria, terms) &&
      matchesDueFilter(task.due, criteria.due, today) &&
      (!criteria.staleOnly || stalenessOf(task, today).level !== 'none'),
  );
}

/** Tasks that satisfy the archived view's search, Projects and Responsibilities. Keeps the input order. */
export function filterArchivedTasks(tasks: readonly Task[], criteria: ArchiveFilterCriteria): Task[] {
  const terms = searchTerms(criteria.query);
  return tasks.filter((task) => matchesArchiveCriteria(task, criteria, terms));
}
