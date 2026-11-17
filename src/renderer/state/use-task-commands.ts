import { useMemo, useRef } from 'react';
import type { MboardApi, NewTaskInput, RevertExpectation, Status, Task, TaskEdit, TaskId } from '../../shared/contract';
import { topOfColumnBeforeId } from '../lib/board-view';
import type { TaskSelection } from './use-task-selection';
import { useRunCommand } from './use-run-command';

export interface TaskCommands {
  create: (input: NewTaskInput) => Promise<boolean>;
  edit: (id: TaskId, edit: TaskEdit) => Promise<boolean>;
  addComment: (id: TaskId, text: string) => Promise<boolean>;
  moveToTopOf: (id: TaskId, status: Status) => Promise<boolean>;
  drop: (id: TaskId, status: Status, beforeId: TaskId | null) => Promise<boolean>;
  archive: (id: TaskId) => Promise<boolean>;
  archiveAllDone: () => Promise<boolean>;
  restore: (id: TaskId) => Promise<boolean>;
  revert: (id: TaskId, toEntryIndex: number, expected: RevertExpectation) => Promise<boolean>;
  remove: (id: TaskId) => Promise<boolean>;
  openInObsidian: (id: TaskId) => Promise<boolean>;
}

/**
 * Every task command the UI issues. Each runs through the toast-on-rejection runner and keeps the
 * drawer's selection pointing at the task's new id when a command renames or moves its file.
 */
export function useTaskCommands(tasks: readonly Task[], selection: TaskSelection): TaskCommands {
  const run = useRunCommand();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

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

    return {
      create: (input) => simple((api) => api.createTask(input)),
      edit: (id, edit) => change(id, (api) => api.editTask(id, edit)),
      addComment: (id, text) => change(id, (api) => api.addComment(id, text)),
      moveToTopOf: (id, status) => {
        const beforeId = topOfColumnBeforeId(tasksRef.current, status, id);
        return change(id, (api) => api.moveTask(id, status, beforeId));
      },
      drop: (id, status, beforeId) => change(id, (api) => api.moveTask(id, status, beforeId)),
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
    };
  }, [run]);
}
