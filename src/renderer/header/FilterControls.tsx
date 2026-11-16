import { RESPONSIBILITIES, type DueFilter, type FilterCriteria, type Responsibility } from '../../domain';
import type { FilterAction } from '../lib/filters';
import { FilterPopover } from './FilterPopover';
import styles from './Header.module.css';

const DUE_OPTIONS: ReadonlyArray<{ value: DueFilter; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'thisWeek', label: 'Due this week' },
  { value: 'none', label: 'No due date' },
];

interface FilterControlsProps {
  criteria: FilterCriteria;
  projects: readonly string[];
  showBoardOnlyFilters: boolean;
  dispatch: (action: FilterAction) => void;
}

/**
 * The header's Project, Responsibility, Due and Stale only controls. Due and Stale only apply to the
 * board, so the archived view hides them.
 */
export function FilterControls({ criteria, projects, showBoardOnlyFilters, dispatch }: FilterControlsProps) {
  return (
    <div role="group" aria-label="Filters" className={styles.filters}>
      <FilterPopover label="Project" isActive={criteria.projects.size > 0} activeCount={criteria.projects.size}>
        <label>
          <input
            type="checkbox"
            checked={criteria.projects.has(null)}
            onChange={() => dispatch({ type: 'toggleProject', project: null })}
          />
          No project
        </label>
        {projects.map((project) => (
          <label key={project}>
            <input
              type="checkbox"
              checked={criteria.projects.has(project)}
              onChange={() => dispatch({ type: 'toggleProject', project })}
            />
            {project}
          </label>
        ))}
      </FilterPopover>
      <FilterPopover
        label="Responsibility"
        isActive={criteria.responsibilities.size > 0}
        activeCount={criteria.responsibilities.size}
      >
        {RESPONSIBILITIES.map((responsibility: Responsibility) => (
          <label key={responsibility}>
            <input
              type="checkbox"
              checked={criteria.responsibilities.has(responsibility)}
              onChange={() => dispatch({ type: 'toggleResponsibility', responsibility })}
            />
            {responsibility}
          </label>
        ))}
      </FilterPopover>
      {showBoardOnlyFilters && (
        <>
          <FilterPopover label="Due" isActive={criteria.due !== 'any'}>
            {DUE_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="due-filter"
                  checked={criteria.due === option.value}
                  onChange={() => dispatch({ type: 'setDue', due: option.value })}
                />
                {option.label}
              </label>
            ))}
          </FilterPopover>
          <label className={styles.staleToggle}>
            <input
              type="checkbox"
              role="switch"
              checked={criteria.staleOnly}
              onChange={(event) => dispatch({ type: 'setStaleOnly', staleOnly: event.target.checked })}
            />
            Stale only
          </label>
        </>
      )}
    </div>
  );
}
