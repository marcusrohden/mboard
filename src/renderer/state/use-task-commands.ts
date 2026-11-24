import { useMemo, useRef } from 'react';
import { asksForMoveComment } from '../../domain';
import type {
  MboardApi,
  NewTaskInput,
  ProjectColour,
  ProjectRename,
  RevertExpectation,
  Status,
  Task,
  TaskComment,
  TaskEdit,
  TaskId,
} from '../../shared/contract';
import { topOfColumnBeforeId } from '../lib/board-view';
import type { AskForMoveComment } from '../move-comment/use-move-comment-prompt';
import type { TaskSelection } from './use-task-selection';
import { useRunCommand } from './use-run-command';

export interface TaskCommands {
  create: (input: NewTaskInput) => Promise<boolean>;
  edit: (id: TaskId, edit: TaskEdit) => Promise<boolean>;
  addComment: (id: TaskId, text: string) => Promise<boolean>;
  changeCommentDate: (id: TaskId, comment: TaskComment, at: string) => Promise<boolean>;
  moveToTopOf: (id: TaskId, status: Status) => Promise<boolean>;
  drop: (id: TaskId, status: Status, beforeId: TaskId | null) => Promise<boolean>;
  archive: (id: TaskId) => Promise<boolean>;
  archiveAllDone: () => Promise<boolean>;
  restore: (id: TaskId) => Promise<boolean>;
  revert: (id: TaskId, toEntryIndex: number, expected: RevertExpectation) => Promise<boolean>;
  remove: (id: TaskId) => Promise<boolean>;
  openInObsidian: (id: TaskId) => Promise<boolean>;
  setProjectColour: (project: string, colour: ProjectColour | null) => Promise<boolean>;
  /** Renames a project on all its tasks, resolving with what changed, or `null` when it failed. */
  renameProject: (from: string, to: string) => Promise<ProjectRename | null>;
  openProjectNote: (project: string) => Promise<boolean>;
}

/**
 * Every task command the UI issues. Each runs through the toast-on-rejection runner and keeps the
 * drawer's selection pointing at the task's new id when a command renames or moves its file. A move to
 * another column that asks for a comment (every one but To do to In progress) waits for `askForMoveComment`,
 * and resolves `false` when the person cancels it.
 */
export function useTaskCommands(
  tasks: readonly Task[],
  selection: TaskSelection,
  askForMoveComment: AskForMoveComment,
): TaskCommands {
  const run = useRunCommand();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const askRef = useRef(askForMoveComment);
  askRef.current = askForMoveComment;

  return useMemo<TaskCommands>(() => {
    async function change(id: TaskId, command: (api: MboardApi) => Promise<Task>): Promise<boolean> {
      selectionRef.current.beginCommand();
      const result = await run(command);
      selectionRef.current.endCommand(id, result.ok ? { kind: 'moved', id: result.value.id } : { kind: 'unchanged' });
      return result.ok;
    }

    async function simple(command: (api: MboardApi) => Promise<unknown>): Promise<boolean> {
      return (await run(command)).ok;
    }

    function move(id: TaskId, status: Status, beforeIdAtMove: () => TaskId | null): Promise<boolean> {
      const moveWith = (comment: string | null): Promise<boolean> =>
        change(id, (api) => api.moveTask(id, status, beforeIdAtMove(), comment));
      const task = tasksRef.current.find((candidate) => candidate.id === id);
      if (task === undefined || !asksForMoveComment(task.status, status)) return moveWith(null);
      return askRef.current({ task, to: status, move: moveWith });
    }

    return {
      create: (input) => simple((api) => api.createTask(input)),
      edit: (id, edit) => change(id, (api) => api.editTask(id, edit)),
      addComment: (id, text) => change(id, (api) => api.addComment(id, text)),
      changeCommentDate: (id, comment, at) => change(id, (api) => api.changeCommentDate(id, comment, at)),
      moveToTopOf: (id, status) => move(id, status, () => topOfColumnBeforeId(tasksRef.current, status, id)),
      drop: (id, status, beforeId) => move(id, status, () => beforeId),
      archive: (id) => change(id, (api) => api.archiveTask(id)),
      restore: (id) => change(id, (api) => api.restoreTask(id)),
      revert: (id, toEntryIndex, expected) => change(id, (api) => api.revertTask(id, toEntryIndex, expected)),
      archiveAllDone: async () => {
        const selected = selectionRef.current.selectedTask;
        if (selected !== null && selected.status === 'Done' && !selected.isArchived) selectionRef.current.close();
        return simple((api) => api.archiveAllDone());
      },
      remove: async (id) => {
        selectionRef.current.beginCommand();
        const result = await run((api) => api.deleteTask(id));
        selectionRef.current.endCommand(id, result.ok ? { kind: 'removed' } : { kind: 'unchanged' });
        return result.ok;
      },
      openInObsidian: (id) => simple((api) => api.openInObsidian(id)),
      setProjectColour: (project, colour) => simple((api) => api.setProjectColour(project, colour)),
      renameProject: async (from, to) => {
        selectionRef.current.beginCommand();
        const result = await run((api) => api.renameProject(from, to));
        selectionRef.current.endCommandWithMoves(result.ok ? result.value.moves : []);
        return result.ok ? result.value : null;
      },
      openProjectNote: (project) => simple((api) => api.openProjectNote(project)),
    };
  }, [run]);
}
