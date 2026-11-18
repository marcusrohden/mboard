import type { TaskComment } from '../../domain';

function compareStamps(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * A copy of `comments`, newest first by their `YYYY-MM-DD HH:mm` stamp. Comments from the same minute put the
 * one added later first, and undated ones go last.
 */
export function newestCommentsFirst(comments: readonly TaskComment[]): TaskComment[] {
  return comments
    .map((comment, position) => ({ comment, position }))
    .sort((left, right) => compareStamps(right.comment.at, left.comment.at) || right.position - left.position)
    .map(({ comment }) => comment);
}
