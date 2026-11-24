import type { TaskComment } from './model';

function compareStamps(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function positionsNewestFirst(comments: readonly TaskComment[]): number[] {
  const stampAt = (position: number): string => comments[position]?.at ?? '';
  return comments
    .map((_comment, position) => position)
    .sort((left, right) => compareStamps(stampAt(right), stampAt(left)) || right - left);
}

/**
 * A copy of `comments`, newest first by their `YYYY-MM-DD HH:mm` stamp. Comments from the same minute put the
 * one later in the file first, and undated ones go last.
 */
export function newestCommentsFirst(comments: readonly TaskComment[]): TaskComment[] {
  return positionsNewestFirst(comments).flatMap((position) => comments[position] ?? []);
}

/**
 * The position in `comments` of the task's latest comment: the one `newestCommentsFirst` puts first.
 * `-1` when there are none.
 */
export function latestCommentPosition(comments: readonly TaskComment[]): number {
  return positionsNewestFirst(comments)[0] ?? -1;
}

/** Whether two comments have the same time and text. */
export function isSameComment(a: TaskComment, b: TaskComment): boolean {
  return a.at === b.at && a.text === b.text;
}

/** A copy of `comments` with `added` placed after the last comment dated no later than it. */
export function withCommentInDateOrder(comments: readonly TaskComment[], added: TaskComment): TaskComment[] {
  const position = comments.findLastIndex((comment) => comment.at <= added.at) + 1;
  return comments.toSpliced(position, 0, { ...added });
}
