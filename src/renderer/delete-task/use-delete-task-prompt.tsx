import { useCallback, useState, type ReactNode } from 'react';
import type { Task, TaskId } from '../../domain';
import { DeleteTaskDialog } from './DeleteTaskDialog';

export interface DeleteTaskPrompt {
  /** Asks to confirm deleting a task. Does nothing for an unknown one. */
  open: (id: TaskId) => void;
  /** The confirmation while it is open, otherwise `null`. Render it once. */
  dialog: ReactNode;
}

function findTask(tasks: readonly Task[], id: TaskId): Task | undefined {
  return tasks.find((candidate) => candidate.id === id);
}

/**
 * The delete confirmation that a card's bin, and ⇧⌘⌫ on a focused card or archived row, open: the same one the
 * drawer's Delete shows. Confirming closes it and moves the task's file to the Trash. The task is read from
 * `tasks` on every render, so the confirmation closes if the task goes away while it is open.
 */
export function useDeleteTaskPrompt(
  tasks: readonly Task[],
  remove: (id: TaskId) => Promise<boolean>,
): DeleteTaskPrompt {
  const [taskId, setTaskId] = useState<TaskId | null>(null);
  const task = taskId === null ? undefined : findTask(tasks, taskId);
  if (taskId !== null && task === undefined) setTaskId(null);

  const open = useCallback(
    (id: TaskId) => {
      if (findTask(tasks, id) !== undefined) setTaskId(id);
    },
    [tasks],
  );

  const dialog =
    task === undefined ? null : (
      <DeleteTaskDialog
        task={task}
        onConfirm={() => {
          setTaskId(null);
          void remove(task.id);
        }}
        onCancel={() => setTaskId(null)}
      />
    );

  return { open, dialog };
}
