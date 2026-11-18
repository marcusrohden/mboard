import type { Ref } from 'react';
import type { FilterCriteria } from '../../domain';
import type { FilterAction } from '../lib/filters';
import { ShortcutHint, shortcutAttributes } from '../shortcuts/shortcuts';
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
  canOpenAgent: boolean;
  /** The agent's columns as a phrase, such as `In progress and Done`, or `null` while they load. */
  agentColumns: string | null;
  searchRef: Ref<HTMLInputElement>;
  dispatch: (action: FilterAction) => void;
  onToggleArchived: () => void;
  onOpenAgent: () => void;
  onNewTask: () => void;
  onOpenSettings: () => void;
}

/**
 * The board header: name, search, filters, Clear, the Archived toggle, Open agent, New task and the Settings
 * gear, each showing its Command shortcut. Open agent is off while the agent's columns have no tasks to give it.
 */
export function Header({
  boardName,
  criteria,
  projects,
  isArchivedView,
  isFilterActive,
  canOpenAgent,
  agentColumns,
  searchRef,
  dispatch,
  onToggleArchived,
  onOpenAgent,
  onNewTask,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.name}>{boardName}</h1>
      <span className={styles.searchBox}>
        <input
          ref={searchRef}
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks"
          className={styles.search}
          value={criteria.query}
          {...shortcutAttributes('focusSearch')}
          onChange={(event) => dispatch({ type: 'setQuery', query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
        />
        <ShortcutHint id="focusSearch" className={styles.searchHint} />
      </span>
      <FilterControls
        criteria={criteria}
        projects={projects}
        showBoardOnlyFilters={!isArchivedView}
        dispatch={dispatch}
      />
      {isFilterActive && (
        <Button variant="quiet" shortcut="clearFilters" onClick={() => dispatch({ type: 'clear' })}>
          Clear
        </Button>
      )}
      <div className={styles.actions}>
        <Button aria-pressed={isArchivedView} shortcut="toggleArchived" onClick={onToggleArchived}>
          Archived
        </Button>
        <Button
          disabled={!canOpenAgent}
          title={
            canOpenAgent
              ? `Open your agent in a terminal with the tasks in ${agentColumns ?? 'its columns'}`
              : `No tasks in ${agentColumns ?? 'the agent’s columns'} yet`
          }
          shortcut="openAgent"
          onClick={onOpenAgent}
        >
          Open agent
        </Button>
        <Button variant="primary" shortcut="newTask" onClick={onNewTask}>
          New task
        </Button>
        <Button
          variant="quiet"
          className={styles.iconButton}
          aria-label="Settings"
          title="Settings (⌘,)"
          shortcutHint="settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </Button>
      </div>
    </header>
  );
}
