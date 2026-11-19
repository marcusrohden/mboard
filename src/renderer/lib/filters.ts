import { EMPTY_FILTER, type DueFilter, type FilterCriteria } from '../../domain';

export type FilterAction =
  | { type: 'setQuery'; query: string }
  | { type: 'toggleProject'; project: string | null }
  | { type: 'setDue'; due: DueFilter }
  | { type: 'setStaleOnly'; staleOnly: boolean }
  | { type: 'renameProject'; from: string; to: string }
  | { type: 'clear' };

function renamed(projects: ReadonlySet<string | null>, from: string, to: string): ReadonlySet<string | null> {
  const wanted = from.toLowerCase();
  const isRenamed = (project: string | null): boolean => project !== null && project.toLowerCase() === wanted;
  if (![...projects].some(isRenamed)) return projects;
  return new Set([...projects].map((project) => (isRenamed(project) ? to : project)));
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * The reducer behind the header's search and filters. `null` in the project set means No project. Renaming
 * a project swaps it for its new name in the project filter, matched ignoring case, so the filter keeps
 * showing the same tasks.
 */
export function filterReducer(criteria: FilterCriteria, action: FilterAction): FilterCriteria {
  switch (action.type) {
    case 'setQuery':
      return { ...criteria, query: action.query };
    case 'toggleProject':
      return { ...criteria, projects: toggled(criteria.projects, action.project) };
    case 'setDue':
      return { ...criteria, due: action.due };
    case 'setStaleOnly':
      return { ...criteria, staleOnly: action.staleOnly };
    case 'renameProject':
      return { ...criteria, projects: renamed(criteria.projects, action.from, action.to) };
    case 'clear':
      return EMPTY_FILTER;
  }
}
