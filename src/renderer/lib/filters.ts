import { EMPTY_FILTER, type DueFilter, type FilterCriteria, type Responsibility } from '../../domain';

export type FilterAction =
  | { type: 'setQuery'; query: string }
  | { type: 'toggleProject'; project: string | null }
  | { type: 'toggleResponsibility'; responsibility: Responsibility }
  | { type: 'setDue'; due: DueFilter }
  | { type: 'setStaleOnly'; staleOnly: boolean }
  | { type: 'clear' };

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * The reducer behind the header's search and filters. `null` in the project set means No project.
 */
export function filterReducer(criteria: FilterCriteria, action: FilterAction): FilterCriteria {
  switch (action.type) {
    case 'setQuery':
      return { ...criteria, query: action.query };
    case 'toggleProject':
      return { ...criteria, projects: toggled(criteria.projects, action.project) };
    case 'toggleResponsibility':
      return { ...criteria, responsibilities: toggled(criteria.responsibilities, action.responsibility) };
    case 'setDue':
      return { ...criteria, due: action.due };
    case 'setStaleOnly':
      return { ...criteria, staleOnly: action.staleOnly };
    case 'clear':
      return EMPTY_FILTER;
  }
}
