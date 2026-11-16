import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  EMPTY_FILTER,
  columnTasks,
  filterArchivedTasks,
  isFilterActive,
  projectSuggestions,
  type FilterCriteria,
} from '../../domain';
import { ArchivedView } from '../archived/ArchivedView';
import { Board } from '../board/Board';
import { TaskDrawer } from '../drawer/TaskDrawer';
import { Header } from '../header/Header';
import { buildColumnViews } from '../lib/board-view';
import { filterReducer } from '../lib/filters';
import { getMboardApi } from '../mboard-api';
import { ReminderBanner } from '../notices/ReminderBanner';
import { UnreadableNotice } from '../notices/UnreadableNotice';
import { useBoardData } from '../state/use-board-data';
import { useGlobalShortcuts } from '../state/use-global-shortcuts';
import { useTaskCommands } from '../state/use-task-commands';
import { useTaskSelection } from '../state/use-task-selection';
import { NewTaskDialog } from '../task-dialog/NewTaskDialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import styles from './BoardScreen.module.css';

function archivedCriteria(criteria: FilterCriteria): FilterCriteria {
  return { ...EMPTY_FILTER, query: criteria.query, projects: criteria.projects, responsibilities: criteria.responsibilities };
}

/**
 * The board screen: header, notices, the board or the archived view, the task detail drawer and the
 * New task and Archive all dialogs. Search and filters live here, in memory, and reset on launch.
 */
export function BoardScreen({ boardName }: { boardName: string }) {
  const { snapshot, banner, preferences, dismissBanner } = useBoardData();
  const [criteria, dispatch] = useReducer(filterReducer, EMPTY_FILTER);
  const [isArchivedView, setIsArchivedView] = useState(false);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isConfirmingArchiveAll, setIsConfirmingArchiveAll] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const selection = useTaskSelection(snapshot);
  const tasks = useMemo(() => snapshot?.tasks ?? [], [snapshot]);
  const commands = useTaskCommands(tasks, selection);
  const { open: openTask } = selection;

  useEffect(() => getMboardApi().onOpenTask(openTask), [openTask]);

  const isModalOpen = isNewTaskOpen || isConfirmingArchiveAll;
  useGlobalShortcuts(
    { onFocusSearch: () => searchRef.current?.focus(), onNewTask: () => setIsNewTaskOpen(true) },
    !isModalOpen,
  );

  const today = snapshot?.today ?? '';
  const views = useMemo(() => buildColumnViews(tasks, criteria, today), [tasks, criteria, today]);
  const suggestions = useMemo(() => projectSuggestions(tasks), [tasks]);
  const projectOptions = useMemo(
    () => [...new Set([...suggestions, ...[...criteria.projects].filter((project): project is string => project !== null)])],
    [suggestions, criteria.projects],
  );
  const archivedTasks = useMemo(() => tasks.filter((task) => task.isArchived), [tasks]);
  const shownArchived = useMemo(
    () => filterArchivedTasks(archivedTasks, archivedCriteria(criteria)),
    [archivedTasks, criteria],
  );
  const activeCriteria = isArchivedView ? archivedCriteria(criteria) : criteria;
  const doneCount = columnTasks(tasks, 'Done').length;

  function dismissReminders(): void {
    dismissBanner();
    void getMboardApi().dismissReminderBanner();
  }

  async function archiveAll(): Promise<void> {
    setIsConfirmingArchiveAll(false);
    await commands.archiveAllDone();
  }

  if (snapshot === null) return <p role="status" className={styles.loading}>Loading…</p>;

  return (
    <div className={styles.screen}>
      <Header
        boardName={boardName}
        criteria={criteria}
        projects={projectOptions}
        isArchivedView={isArchivedView}
        isFilterActive={isFilterActive(activeCriteria)}
        searchRef={searchRef}
        dispatch={dispatch}
        onToggleArchived={() => setIsArchivedView((current) => !current)}
        onNewTask={() => setIsNewTaskOpen(true)}
      />
      <UnreadableNotice files={snapshot.unreadable} />
      <ReminderBanner
        items={banner}
        notificationsUnavailable={preferences?.notificationsAvailable === false}
        onOpenTask={openTask}
        onDismiss={dismissReminders}
      />
      <div className={styles.workspace}>
        <main className={styles.main}>
          {isArchivedView ? (
            <ArchivedView tasks={shownArchived} hasArchivedTasks={archivedTasks.length > 0} onOpen={openTask} />
          ) : (
            <Board
              views={views}
              isFiltered={isFilterActive(criteria)}
              today={snapshot.today}
              onOpen={openTask}
              onArchive={(id) => void commands.archive(id)}
              onArchiveAll={() => setIsConfirmingArchiveAll(true)}
              onMove={commands.drop}
              onNewTask={() => setIsNewTaskOpen(true)}
            />
          )}
        </main>
        {selection.selectedTask !== null && (
          <TaskDrawer task={selection.selectedTask} projectSuggestions={suggestions} commands={commands} onClose={selection.close} />
        )}
      </div>
      {isNewTaskOpen && (
        <NewTaskDialog projectSuggestions={suggestions} onCreate={commands.create} onClose={() => setIsNewTaskOpen(false)} />
      )}
      {isConfirmingArchiveAll && (
        <ConfirmDialog
          title="Archive all done tasks?"
          message={`${doneCount === 1 ? 'The 1 task' : `All ${doneCount} tasks`} in Done will move to the archive.`}
          confirmLabel="Archive all"
          onConfirm={() => void archiveAll()}
          onCancel={() => setIsConfirmingArchiveAll(false)}
        />
      )}
    </div>
  );
}
