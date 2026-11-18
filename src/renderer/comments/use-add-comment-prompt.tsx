import { useCallback, useState, type ReactNode } from 'react';
import type { Task, TaskId } from '../../domain';
import { newestCommentsFirst } from '../lib/comment-order';
import { CommentDialog } from './CommentDialog';

export interface AddCommentPrompt {
  /** Opens the comment dialog for a live task. Does nothing for an archived or unknown one. */
  open: (id: TaskId) => void;
  /** The dialog while it is open, otherwise `null`. Render it once. */
  dialog: ReactNode;
}

function findLiveTask(tasks: readonly Task[], id: TaskId): Task | undefined {
  return tasks.find((candidate) => candidate.id === id && !candidate.isArchived);
}

/**
 * The Add comment dialog a card's speech bubble, and ⇧⌘C, open: the same dialog as a move's comment, except that
 * the comment can't be empty, and the task's previous comments are listed under it, newest first. The task is
 * read from `tasks` on every render, so the list follows changes made while the dialog is open, and the dialog
 * closes if the task is archived or goes away. It closes once the comment is saved, and stays open with the text
 * if saving fails.
 */
export function useAddCommentPrompt(
  tasks: readonly Task[],
  addComment: (id: TaskId, text: string) => Promise<boolean>,
): AddCommentPrompt {
  const [taskId, setTaskId] = useState<TaskId | null>(null);
  const task = taskId === null ? undefined : findLiveTask(tasks, taskId);
  if (taskId !== null && task === undefined) setTaskId(null);

  const open = useCallback(
    (id: TaskId) => {
      if (findLiveTask(tasks, id) !== undefined) setTaskId(id);
    },
    [tasks],
  );

  const dialog =
    task === undefined ? null : (
      <CommentDialog
        key={task.id}
        title="Add comment"
        message={`On “${task.title}”.`}
        label="Comment"
        placeholder="Enter adds the comment. Shift+Enter starts a new line."
        confirmLabel="Add comment"
        isRequired
        previousComments={newestCommentsFirst(task.comments)}
        onSubmit={async (comment) => {
          const added = comment !== null && (await addComment(task.id, comment));
          if (added) setTaskId(null);
          return added;
        }}
        onCancel={() => setTaskId(null)}
      />
    );

  return { open, dialog };
}
