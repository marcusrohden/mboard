import type { LocalDate, NewTaskInput, Status, TaskComment, TaskDocument, TaskEdit } from './model';
import { buildLedger, initialLedger, type CommentsDelta } from './ledger';
import { COLUMNS, isStatus } from './model';
import { projectSpellingAfterUpdate } from './projectLink';
import { canonicalProject } from './projects';
import { trimBlankLines } from './taskFile';
import { formatLocalDateTime, formatLogTimestamp, normaliseLogTimestamp, parseLocalDate } from './time';

/** The result of a change. When `changed` is false, `document` is the document that was passed in. */
export interface ChangeResult {
  changed: boolean;
  document: TaskDocument;
}

/** What a change needs to know about the moment and the board. */
export interface ChangeContext {
  now: Date;
  knownProjects: readonly string[];
}

/** What creating a task needs beyond the user's input. `order` is the position in its column. */
export interface CreateContext extends ChangeContext {
  order: number | null;
}

const NO_VALUE_LABEL = '(none)';
const STRUCTURAL_HEADING = /^##[ \t]+(comments|history)[ \t]*$/i;
const COMMENT_DATE_HEADING = /^###[ \t]+(.+?)[ \t]*$/;

function unchanged(document: TaskDocument): ChangeResult {
  return { changed: false, document };
}

function withHistoryEntry(
  document: TaskDocument,
  changes: Partial<TaskDocument>,
  historyText: string,
  now: Date,
  comments: CommentsDelta | null,
): TaskDocument {
  const changed = { ...document, rawProject: projectSpellingAfterUpdate(document.rawProject), ...changes };
  const ledger = buildLedger(document, changed, now, comments);
  return { ...changed, history: [...document.history, { at: formatLogTimestamp(now), text: historyText, ledger }] };
}

function recordUpdate(
  document: TaskDocument,
  changes: Partial<TaskDocument>,
  historyText: string,
  now: Date,
  comments: CommentsDelta | null = null,
): ChangeResult {
  const updated = withHistoryEntry(document, changes, historyText, now, comments);
  return { changed: true, document: { ...updated, updated: formatLocalDateTime(now) } };
}

function normaliseTitle(raw: string): string {
  const title = raw.replace(/\s+/g, ' ').trim();
  if (title === '') throw new Error('A task needs a title.');
  return title;
}

function normaliseDescription(raw: string): string {
  return trimBlankLines(raw.replace(/\r\n?/g, '\n'));
}

function validateDue(due: LocalDate | null): LocalDate | null {
  if (due === null) return null;
  const valid = parseLocalDate(due);
  if (valid === null) throw new Error('The due date must be a real date, written as YYYY-MM-DD.');
  return valid;
}

function validateStatus(status: Status): Status {
  if (!isStatus(status)) throw new Error(`The column must be one of: ${COLUMNS.join(', ')}.`);
  return status;
}

function assertSafeBodyText(text: string, subject: string): void {
  const clashes = text.split('\n').some((line) => STRUCTURAL_HEADING.test(line) || isDatedCommentHeading(line));
  if (clashes) {
    throw new Error(
      `The ${subject} can't contain a line that is just "## Comments", "## History" or a dated "### " heading, because the file would read back differently.`,
    );
  }
}

function isDatedCommentHeading(line: string): boolean {
  const headingText = COMMENT_DATE_HEADING.exec(line)?.[1];
  return headingText !== undefined && normaliseLogTimestamp(headingText) !== null;
}

function describeProject(project: string | null): string {
  return project ?? NO_VALUE_LABEL;
}

function describeDue(due: LocalDate | null): string {
  return due ?? NO_VALUE_LABEL;
}

/**
 * Creates the document for a new task. `created` and `updated` are both `context.now`, and the history
 * holds the single entry `Created in <column>`.
 *
 * @throws Error with a user-presentable message when the title is empty or the due date isn't a real date.
 */
export function createTaskDocument(input: NewTaskInput, context: CreateContext): TaskDocument {
  const status = validateStatus(input.status);
  const description = normaliseDescription(input.description);
  assertSafeBodyText(description, 'description');
  const timestamp = formatLocalDateTime(context.now);
  const document: TaskDocument = {
    title: normaliseTitle(input.title),
    status,
    rawStatus: null,
    project: canonicalProject(input.project, context.knownProjects),
    rawProject: null,
    due: validateDue(input.due),
    created: timestamp,
    updated: timestamp,
    archivedAt: null,
    order: context.order,
    description,
    comments: [],
    history: [],
    unknownFrontmatter: [],
  };
  const created = {
    at: formatLogTimestamp(context.now),
    text: `Created in ${status}`,
    ledger: initialLedger(document, context.now),
  };
  return { ...document, history: [created] };
}

function editTitle(document: TaskDocument, value: string, now: Date): ChangeResult {
  const title = normaliseTitle(value);
  if (title === document.title) return unchanged(document);
  return recordUpdate(document, { title }, `Title changed from "${document.title}" to "${title}"`, now);
}

function editDescription(document: TaskDocument, value: string, now: Date): ChangeResult {
  const description = normaliseDescription(value);
  assertSafeBodyText(description, 'description');
  if (description === document.description) return unchanged(document);
  return recordUpdate(document, { description }, 'Description edited', now);
}

function projectChangeText(verb: 'changed' | 'renamed', from: string | null, to: string | null): string {
  return `Project ${verb} from ${describeProject(from)} to ${describeProject(to)}`;
}

function editProject(document: TaskDocument, value: string | null, context: ChangeContext): ChangeResult {
  const project = canonicalProject(value, context.knownProjects);
  if (project === document.project) return unchanged(document);
  const text = projectChangeText('changed', document.project, project);
  return recordUpdate(document, { project, rawProject: null }, text, context.now);
}

function editDue(document: TaskDocument, value: LocalDate | null, now: Date): ChangeResult {
  const due = validateDue(value);
  if (due === document.due) return unchanged(document);
  const text = `Due date changed from ${describeDue(document.due)} to ${describeDue(due)}`;
  return recordUpdate(document, { due }, text, now);
}

/**
 * Applies a single-field edit. An edit that leaves the value as it was reports `changed: false` and
 * does not touch `updated` or the history.
 *
 * @throws Error with a user-presentable message when the value is invalid.
 */
export function applyEdit(document: TaskDocument, edit: TaskEdit, context: ChangeContext): ChangeResult {
  switch (edit.field) {
    case 'title':
      return editTitle(document, edit.value, context.now);
    case 'description':
      return editDescription(document, edit.value, context.now);
    case 'project':
      return editProject(document, edit.value, context);
    case 'due':
      return editDue(document, edit.value, context.now);
  }
}

/** Why a task's project changes without an update: its whole project was renamed, or it is archived. */
export type QuietProjectChange = 'renamed' | 'changed';

/**
 * Changes a task's project with a history entry and its ledger, but leaves `updated` as it was, so the
 * task's age doesn't change. Used when a project is renamed, which isn't work on its tasks, and when an
 * archived task's project changes. The entry reads `Project renamed from A to B` or
 * `Project changed from A to B`. A value that leaves the project as it was changes nothing. The name takes
 * the spelling of a project in `context.knownProjects` that matches it ignoring case.
 */
export function changeProjectQuietly(
  document: TaskDocument,
  value: string | null,
  context: ChangeContext,
  reason: QuietProjectChange,
): ChangeResult {
  const project = canonicalProject(value, context.knownProjects);
  if (project === document.project) return unchanged(document);
  const text = projectChangeText(reason, document.project, project);
  return {
    changed: true,
    document: withHistoryEntry(document, { project, rawProject: null }, text, context.now, null),
  };
}

function normaliseCommentText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

function newComment(text: string, now: Date): TaskComment {
  const trimmed = normaliseCommentText(text);
  if (trimmed === '') throw new Error("A comment can't be empty.");
  assertSafeBodyText(trimmed, 'comment');
  return { at: formatLogTimestamp(now), text: trimmed };
}

function commentAdded(document: TaskDocument, comment: TaskComment): Partial<TaskDocument> {
  return { comments: [...document.comments, comment] };
}

function onlyAdded(comment: TaskComment): CommentsDelta {
  return { added: [comment], removed: [] };
}

function recordComment(document: TaskDocument, comment: TaskComment, now: Date): TaskDocument {
  return recordUpdate(document, commentAdded(document, comment), 'Comment added', now, onlyAdded(comment)).document;
}

/**
 * Appends a comment dated `now` and records `Comment added`. The text is trimmed.
 *
 * @throws Error with a user-presentable message when the text is empty.
 */
export function addComment(document: TaskDocument, text: string, now: Date): TaskDocument {
  return recordComment(document, newComment(text, now), now);
}

/**
 * Whether moving a task between these columns asks the person for a comment. Every move to another column
 * does, apart from starting work: To do to In progress. Reordering within a column never does.
 */
export function asksForMoveComment(from: Status, to: Status): boolean {
  return from !== to && !(from === 'To do' && to === 'In progress');
}

/**
 * Puts a task in a column at `order`. Changing column is an update that records `Moved from <old> to <new>`,
 * and the `comment`, when there is one, is added by that same update, so the one history entry and its
 * revert cover both. Staying in the same column only changes `order`, which is not an update, unless a
 * comment comes with it: that is recorded as `Comment added`. A comment that is empty once trimmed counts
 * as none.
 *
 * @throws Error with a user-presentable message when the column doesn't exist or the comment can't be stored.
 */
export function moveToColumn(
  document: TaskDocument,
  status: Status,
  order: number | null,
  now: Date,
  comment: string | null = null,
): ChangeResult {
  const target = validateStatus(status);
  const added = comment === null || normaliseCommentText(comment) === '' ? null : newComment(comment, now);
  if (target === document.status) {
    const reordered = setOrder(document, order);
    return added === null ? reordered : { changed: true, document: recordComment(reordered.document, added, now) };
  }
  const moved: Partial<TaskDocument> = { status: target, rawStatus: null, order };
  const historyText = `Moved from ${document.status} to ${target}`;
  if (added === null) return recordUpdate(document, moved, historyText, now);
  return recordUpdate(document, { ...moved, ...commentAdded(document, added) }, historyText, now, onlyAdded(added));
}

/** Sets `order` without recording an update. Used for reordering and for renumbering a column. */
export function setOrder(document: TaskDocument, order: number | null): ChangeResult {
  if (order === document.order) return unchanged(document);
  return { changed: true, document: { ...document, order } };
}

/**
 * Archives a task: sets `archived` to `now` and records `Archived`.
 *
 * @throws Error with a user-presentable message when the task isn't in Done.
 */
export function archiveDocument(document: TaskDocument, now: Date): TaskDocument {
  if (document.status !== 'Done') throw new Error('Only tasks in Done can be archived.');
  return recordUpdate(document, { archivedAt: formatLocalDateTime(now) }, 'Archived', now).document;
}

/** Restores an archived task to Done at `order`, removes `archived` and records `Restored to Done`. */
export function restoreDocument(document: TaskDocument, order: number | null, now: Date): TaskDocument {
  return recordUpdate(document, { status: 'Done', rawStatus: null, archivedAt: null, order }, 'Restored to Done', now)
    .document;
}
