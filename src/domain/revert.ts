import { buildLedger, isCommentsChange, writeTrackedValue, type CommentsDelta } from './ledger';
import type { HistoryEntry, LedgerChange, RevertExpectation, TaskComment, TaskDocument } from './model';
import { formatCompactDateTime, formatLocalDate, formatLocalDateTime, formatLogTimestamp } from './time';

/** Why a task can't be reverted to a history entry. */
export type RevertBlocker = 'archived' | 'noSuchEntry' | 'latest' | 'undated' | 'beforeLedger' | 'archivedThen';

/** What deciding whether a revert is allowed needs to know about a task. */
export interface RevertSource {
  history: readonly HistoryEntry[];
  archivedAt: string | null;
  isArchived: boolean;
}

/** The user-presentable reason for each blocker, used when main refuses a revert. */
export const REVERT_BLOCKER_MESSAGES: Readonly<Record<RevertBlocker, string>> = {
  archived: "Archived tasks can't be reverted. Restore the task first.",
  noSuchEntry: "That history entry doesn't exist.",
  latest: "That's the latest entry, so there's nothing to revert.",
  undated: "That history entry has no date, so the task can't be reverted to it.",
  beforeLedger: "A later change was recorded before mboard kept a ledger, so the task can't be reverted that far.",
  archivedThen: 'The task was archived at that point. Revert to an entry where it was on the board.',
};

function isEntryIndex(history: readonly HistoryEntry[], index: number): boolean {
  return Number.isSafeInteger(index) && index >= 0 && index < history.length;
}

function changesNewestFirst(history: readonly HistoryEntry[], index: number): LedgerChange[] {
  return history
    .slice(index + 1)
    .reverse()
    .flatMap((entry) => [...(entry.ledger?.changes ?? [])].reverse());
}

function archivedAfter(source: RevertSource, index: number): string | null {
  return changesNewestFirst(source.history, index).reduce<string | null>(
    (archived, change) => (!isCommentsChange(change) && change.field === 'archived' ? change.from : archived),
    source.archivedAt,
  );
}

/**
 * Why the task can't be reverted to entry `index`, or `null` when it can. A revert needs a live task, a
 * dated entry that isn't the latest, ledger data on every later entry, and a state after the entry in
 * which the task wasn't archived.
 */
export function revertBlocker(source: RevertSource, index: number): RevertBlocker | null {
  if (source.isArchived) return 'archived';
  if (!isEntryIndex(source.history, index)) return 'noSuchEntry';
  if (index === source.history.length - 1) return 'latest';
  if (source.history[index]?.at === '') return 'undated';
  if (source.history.slice(index + 1).some((entry) => entry.ledger === undefined)) return 'beforeLedger';
  if (archivedAfter(source, index) !== null) return 'archivedThen';
  return null;
}

function isSameComment(a: TaskComment, b: TaskComment): boolean {
  return a.at === b.at && a.text === b.text;
}

function withoutComment(comments: readonly TaskComment[], removed: TaskComment): TaskComment[] {
  const position = comments.findLastIndex((comment) => isSameComment(comment, removed));
  return position === -1 ? [...comments] : comments.toSpliced(position, 1);
}

function withCommentInDateOrder(comments: readonly TaskComment[], added: TaskComment): TaskComment[] {
  const position = comments.findLastIndex((comment) => comment.at <= added.at) + 1;
  return comments.toSpliced(position, 0, { ...added });
}

function undoChange(document: TaskDocument, change: LedgerChange): TaskDocument {
  if (!isCommentsChange(change)) return writeTrackedValue(document, change, change.from);
  const withoutAdded = change.added.reduce(withoutComment, document.comments);
  return {
    ...document,
    comments: change.removed.reduce(withCommentInDateOrder, withoutAdded),
  };
}

function commentsMissingFrom(comments: readonly TaskComment[], others: readonly TaskComment[]): TaskComment[] {
  const unmatched = [...others];
  return comments.filter((comment) => {
    const match = unmatched.findIndex((other) => isSameComment(other, comment));
    if (match === -1) return true;
    unmatched.splice(match, 1);
    return false;
  });
}

function commentsDelta(before: readonly TaskComment[], after: readonly TaskComment[]): CommentsDelta {
  return {
    added: commentsMissingFrom(after, before),
    removed: commentsMissingFrom(before, after),
  };
}

function revertText(target: HistoryEntry, discarded: number, now: Date): string {
  const point = formatCompactDateTime(target.at, formatLocalDate(now));
  return `Reverted to ${point} — ${discarded} ${discarded === 1 ? 'change' : 'changes'} discarded`;
}

/**
 * Reverts a live task to the state right after history entry `index`. It walks the later entries from
 * newest to oldest and undoes each change: a field gets its `from` value back, comments a change added are
 * removed (one already gone is skipped) and comments it removed come back in date order. A field no later
 * entry touched keeps its current value, so outside edits to it survive.
 *
 * The history keeps entries `0..index` and gains one entry, `Reverted to <d MMM HH:mm> — N changes discarded`,
 * whose ledger holds everything the revert changed, so that a later revert can walk back through it.
 *
 * @throws Error with a user-presentable message when the task can't be reverted to that entry.
 */
export function revertDocument(document: TaskDocument, index: number, now: Date): TaskDocument {
  const blocker = revertBlocker({ ...document, isArchived: false }, index);
  if (blocker !== null) throw new Error(REVERT_BLOCKER_MESSAGES[blocker]);
  const target = document.history[index] as HistoryEntry;
  const reverted = changesNewestFirst(document.history, index).reduce(undoChange, document);
  const discarded = document.history.length - 1 - index;
  const ledger = buildLedger(document, reverted, now, commentsDelta(document.comments, reverted.comments));
  const entry = {
    at: formatLogTimestamp(now),
    text: revertText(target, discarded, now),
    ledger,
  };
  return {
    ...reverted,
    updated: formatLocalDateTime(now),
    history: [...document.history.slice(0, index + 1), entry],
  };
}

/** What the renderer sends with a revert request, describing entry `index` of `history` as shown. */
export function revertExpectationFor(history: readonly HistoryEntry[], index: number): RevertExpectation {
  const entry = history[index];
  return {
    historyLength: history.length,
    at: entry?.at ?? '',
    text: entry?.text ?? '',
  };
}

/** Whether `history` still has, at `index`, the entry the person asked to revert to. */
export function isSameRevertPoint(
  history: readonly HistoryEntry[],
  index: number,
  expected: RevertExpectation,
): boolean {
  const entry = history[index];
  return (
    history.length === expected.historyLength &&
    entry !== undefined &&
    entry.at === expected.at &&
    entry.text === expected.text
  );
}
