import { useCallback, useState, type ReactNode } from 'react';
import type { Task, TaskId } from '../../domain';
import { CommentDialog } from './CommentDialog';

export interface AddCommentPrompt {
  /** Opens the comment dialog for a live task. Does nothing for an archived or unknown one. */
  open: (id: TaskId) => void;
  /** The dialog while it is open, otherwise `null`. Render it once. */
  dialog: ReactNode;
}

/**
 * The Add comment dialog a card's speech bubble, and ⇧⌘C, open: the same dialog as a move's comment, except that
 * the comment can't be empty. It closes once the comment is saved, and stays open with the text if saving fails.
 */
export function useAddCommentPrompt(
  tasks: readonly Task[],
  addComment: (id: TaskId, text: string) => Promise<boolean>,
): AddCommentPrompt {
  const [task, setTask] = useState<Task | null>(null);

  const open = useCallback(
    (id: TaskId) => {
      const found = tasks.find((candidate) => candidate.id === id);
      if (found !== undefined && !found.isArchived) setTask(found);
    },
    [tasks],
  );

  const dialog =
    task === null ? null : (
      <CommentDialog
        key={task.id}
        title="Add comment"
        message={`On “${task.title}”.`}
        label="Comment"
        placeholder="Enter adds the comment. Shift+Enter starts a new line."
        confirmLabel="Add comment"
        isRequired
        onSubmit={async (comment) => {
          const added = comment !== null && (await addComment(task.id, comment));
          if (added) setTask(null);
          return added;
        }}
        onCancel={() => setTask(null)}
      />
    );

  return { open, dialog };
}
