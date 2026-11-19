import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  EMPTY_FILTER,
  columnTasks,
  describeColumns,
  tasksForAgent,
  filterArchivedTasks,
  isFilterActive,
  projectSuggestions,
  type FilterCriteria,
} from '../../domain';
import { useOpenAgent } from '../agent/use-open-agent';
import { ArchivedView } from '../archived/ArchivedView';
import { Board } from '../board/Board';
import { useAddCommentPrompt } from '../comments/use-add-comment-prompt';
import { useDeleteTaskPrompt } from '../delete-task/use-delete-task-prompt';
import { TaskDrawer } from '../drawer/TaskDrawer';
import { Header } from '../header/Header';
import { buildColumnViews } from '../lib/board-view';
import { filterReducer } from '../lib/filters';
import { getMboardApi } from '../mboard-api';
import { useMoveCommentPrompt } from '../move-comment/use-move-comment-prompt';
import { ReminderBanner } from '../notices/ReminderBanner';
import { useToasts } from '../notices/ToastProvider';
import { UnreadableNotice } from '../notices/UnreadableNotice';
import { EditProjectDialog } from '../projects/EditProjectDialog';
import { taskCount } from '../projects/project-impact';
import { useSettingsDialog } from '../settings/SettingsProvider';
import { useAgeThresholds } from '../state/age-thresholds';
import { ProjectColoursProvider } from '../state/project-colours';
import { useBoardData } from '../state/use-board-data';
import { useLoadedAndPushed } from '../state/use-loaded-and-pushed';
import { useTaskCommands } from '../state/use-task-commands';
import { useTaskSelection } from '../state/use-task-selection';
import { useTaskShortcuts } from '../state/use-task-shortcuts';
import { useShortcut } from '../shortcuts/shortcuts';
import { NewTaskDialog } from '../task-dialog/NewTaskDialog';
import type { ProjectRename } from '../../shared/contract';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import styles from './BoardScreen.module.css';

function archivedCriteria(criteria: FilterCriteria): FilterCriteria {
  return { ...EMPTY_FILTER, query: criteria.query, projects: criteria.projects };
}

function renamedMessage(from: string, rename: ProjectRename): string {
  return `Renamed ${from} to ${rename.project} on ${taskCount(rename.renamed)}.`;
}

/**
 * The board screen: header, notices, the board or the archived view, the task detail drawer and the
 * New task, comment, Edit project, Delete task and Archive all dialogs, all sharing the board's project colours. Search and
 * filters live here, in memory, and reset on launch; renaming a project carries it over in the filter.
 */
export function BoardScreen({ boardName }: { boardName: string }) {
  const { snapshot, banner, preferences, dismissBanner } = useBoardData();
  const [criteria, dispatch] = useReducer(filterReducer, EMPTY_FILTER);
  const [isArchivedView, setIsArchivedView] = useState(false);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isConfirmingArchiveAll, setIsConfirmingArchiveAll] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const notify = useToasts();
  const searchRef = useRef<HTMLInputElement>(null);
  const settings = useSettingsDialog();
  const agent = useOpenAgent();
  const api = getMboardApi();
  const agentSettings = useLoadedAndPushed(api.getAgentSettings, api.onAgentSettings);

  const selection = useTaskSelection(snapshot);
  const tasks = useMemo(() => snapshot?.tasks ?? [], [snapshot]);
  const movePrompt = useMoveCommentPrompt();
  const commands = useTaskCommands(tasks, selection, movePrompt.ask);
  const commentPrompt = useAddCommentPrompt(tasks, commands.addComment);
  const deletePrompt = useDeleteTaskPrompt(tasks, commands.remove);
  const { open: openTask } = selection;

  useEffect(() => getMboardApi().onOpenTask(openTask), [openTask]);

  useShortcut('focusSearch', () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  });
  useTaskShortcuts(selection.selectedTask, tasks, commands, commentPrompt.open, deletePrompt.open);

  const today = snapshot?.today ?? '';
  const thresholds = useAgeThresholds();
  const views = useMemo(
    () => buildColumnViews(tasks, criteria, today, thresholds),
    [tasks, criteria, today, thresholds],
  );
  const suggestions = useMemo(() => projectSuggestions(tasks), [tasks]);
  const projectOptions = useMemo(
    () => [
      ...new Set([...suggestions, ...[...criteria.projects].filter((project): project is string => project !== null)]),
    ],
    [suggestions, criteria.projects],
  );
  const archivedTasks = useMemo(() => tasks.filter((task) => task.isArchived), [tasks]);
  const shownArchived = useMemo(
    () => filterArchivedTasks(archivedTasks, archivedCriteria(criteria)),
    [archivedTasks, criteria],
  );
  const activeCriteria = isArchivedView ? archivedCriteria(criteria) : criteria;
  const doneCount = columnTasks(tasks, 'Done').length;
  const agentTaskCount = agentSettings === null ? 0 : tasksForAgent(tasks, agentSettings.columns).length;

  function dismissReminders(): void {
    dismissBanner();
    void getMboardApi().dismissReminderBanner();
  }

  async function archiveAll(): Promise<void> {
    setIsConfirmingArchiveAll(false);
    await commands.archiveAllDone();
  }

  function projectRenamed(from: string, rename: ProjectRename): void {
    dispatch({ type: 'renameProject', from, to: rename.project });
    notify(renamedMessage(from, rename));
  }

  if (snapshot === null)
    return (
      <p role="status" className={styles.loading}>
        Loading…
      </p>
    );

  return (
    <ProjectColoursProvider colours={snapshot.projectColours}>
      <div className={styles.screen}>
        <Header
          boardName={boardName}
          criteria={criteria}
          projects={projectOptions}
          isArchivedView={isArchivedView}
          isFilterActive={isFilterActive(activeCriteria)}
          canOpenAgent={agentTaskCount > 0 && !agent.isOpening}
          agentColumns={agentSettings === null ? null : describeColumns(agentSettings.columns)}
          searchRef={searchRef}
          dispatch={dispatch}
          onToggleArchived={() => setIsArchivedView((current) => !current)}
          onOpenAgent={agent.open}
          onNewTask={() => setIsNewTaskOpen(true)}
          onOpenSettings={settings.open}
          onEditProject={setEditingProject}
        />
        <UnreadableNotice files={snapshot.unreadable} />
        <ReminderBanner
          items={banner}
          notificationsUnavailable={preferences?.notificationsAvailable === false}
          onOpenTask={openTask}
          onDismiss={dismissReminders}
        />
        <div className={styles.workspace}>
          {selection.selectedTask !== null && (
            <TaskDrawer
              task={selection.selectedTask}
              today={snapshot.today}
              projectSuggestions={suggestions}
              commands={commands}
              onClose={selection.close}
            />
          )}
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
                onComplete={(id) => void commands.moveToTopOf(id, 'Done')}
                onComment={commentPrompt.open}
                onDelete={deletePrompt.open}
                onArchiveAll={() => setIsConfirmingArchiveAll(true)}
                onMove={commands.drop}
                onNewTask={() => setIsNewTaskOpen(true)}
              />
            )}
          </main>
        </div>
        {isNewTaskOpen && (
          <NewTaskDialog
            projectSuggestions={suggestions}
            onCreate={commands.create}
            onSetProjectColour={commands.setProjectColour}
            onClose={() => setIsNewTaskOpen(false)}
          />
        )}
        {editingProject !== null && (
          <EditProjectDialog
            project={editingProject}
            tasks={tasks}
            onRename={commands.renameProject}
            onSetColour={commands.setProjectColour}
            onOpenNote={commands.openProjectNote}
            onRenamed={projectRenamed}
            onClose={() => setEditingProject(null)}
          />
        )}
        {movePrompt.dialog}
        {commentPrompt.dialog}
        {deletePrompt.dialog}
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
    </ProjectColoursProvider>
  );
}
