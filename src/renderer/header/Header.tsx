import type { Ref } from 'react';
import type { FilterCriteria } from '../../domain';
import type { FilterAction } from '../lib/filters';
import { Button } from '../ui/Button';
import { FilterControls } from './FilterControls';
import styles from './Header.module.css';
import { SettingsIcon } from './SettingsIcon';

interface HeaderProps {
  boardName: string;
  criteria: FilterCriteria;
  projects: readonly string[];
  isArchivedView: boolean;
  isFilterActive: boolean;
  searchRef: Ref<HTMLInputElement>;
  dispatch: (action: FilterAction) => void;
  onToggleArchived: () => void;
  onNewTask: () => void;
  onOpenSettings: () => void;
}

/**
 * The board header: name, search, filters, Clear, the Archived toggle, New task and the Settings gear.
 */
export function Header({
  boardName,
  criteria,
  projects,
  isArchivedView,
  isFilterActive,
  searchRef,
  dispatch,
  onToggleArchived,
  onNewTask,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.name}>{boardName}</h1>
      <input
        ref={searchRef}
        type="search"
        aria-label="Search tasks"
        placeholder="Search tasks"
        className={styles.search}
        value={criteria.query}
        onChange={(event) => dispatch({ type: 'setQuery', query: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.currentTarget.blur();
        }}
      />
      <FilterControls criteria={criteria} projects={projects} showBoardOnlyFilters={!isArchivedView} dispatch={dispatch} />
      {isFilterActive && (
        <Button variant="quiet" onClick={() => dispatch({ type: 'clear' })}>
          Clear
        </Button>
      )}
      <div className={styles.actions}>
        <Button aria-pressed={isArchivedView} onClick={onToggleArchived}>
          Archived
        </Button>
        <Button variant="primary" onClick={onNewTask}>
          New task
        </Button>
        <Button
          variant="quiet"
          className={styles.iconButton}
          aria-label="Settings"
          title="Settings (⌘,)"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </Button>
      </div>
    </header>
  );
}
