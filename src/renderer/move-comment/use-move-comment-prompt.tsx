import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Status, Task } from '../../domain';
import { CommentDialog } from '../comments/CommentDialog';

/** A move waiting for its comment: the task, where it is going, and how to move it once the comment is in. */
export interface MoveCommentRequest {
  task: Task;
  to: Status;
  move: (comment: string | null) => Promise<boolean>;
}

/** Shows the comment dialog for a move and resolves `true` once the task moved, or `false` when cancelled. */
export type AskForMoveComment = (request: MoveCommentRequest) => Promise<boolean>;

export interface MoveCommentPrompt {
  ask: AskForMoveComment;
  /** The dialog while a move is waiting for its comment, otherwise `null`. Render it once. */
  dialog: ReactNode;
}

/**
 * Holds the one move waiting for a comment. Asking again while a dialog is open cancels the earlier move,
 * and so does unmounting.
 */
export function useMoveCommentPrompt(): MoveCommentPrompt {
  const [request, setRequest] = useState<MoveCommentRequest | null>(null);
  const settle = useRef<((moved: boolean) => void) | null>(null);

  const finish = useCallback((moved: boolean) => {
    const resolve = settle.current;
    settle.current = null;
    setRequest(null);
    resolve?.(moved);
  }, []);

  const ask = useCallback<AskForMoveComment>((next) => {
    settle.current?.(false);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
      setRequest(next);
    });
  }, []);

  useEffect(() => () => settle.current?.(false), []);

  const dialog =
    request === null ? null : (
      <CommentDialog
        key={`${request.task.id}:${request.to}`}
        title={`Move to ${request.to}`}
        message={`“${request.task.title}” moves from ${request.task.status} to ${request.to}.`}
        label="Comment (optional)"
        placeholder="Enter moves the task. Shift+Enter starts a new line."
        confirmLabel="Move"
        isRequired={false}
        onSubmit={async (comment) => {
          const moved = await request.move(comment);
          if (moved) finish(true);
          return moved;
        }}
        onCancel={() => finish(false)}
      />
    );

  return { ask, dialog };
}
