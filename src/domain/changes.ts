import type { LocalDate, NewTaskInput, Status, TaskDocument, TaskEdit } from './model';
import { COLUMNS, isStatus } from './model';
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

function recordUpdate(document: TaskDocument, changes: Partial<TaskDocument>, historyText: string, now: Date): ChangeResult {
  return {
    changed: true,
    document: {
      ...document,
      ...changes,
      updated: formatLocalDateTime(now),
      history: [...document.history, { at: formatLogTimestamp(now), text: historyText }],
    },
  };
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
  const clashes = text
    .split('\n')
    .some((line) => STRUCTURAL_HEADING.test(line) || isDatedCommentHeading(line));
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
  return {
    title: normaliseTitle(input.title),
    status,
    rawStatus: null,
    project: canonicalProject(input.project, context.knownProjects),
    due: validateDue(input.due),
    created: timestamp,
    updated: timestamp,
    archivedAt: null,
    order: context.order,
    description,
    comments: [],
    history: [{ at: formatLogTimestamp(context.now), text: `Created in ${status}` }],
    unknownFrontmatter: [],
  };
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

function editProject(document: TaskDocument, value: string | null, context: ChangeContext): ChangeResult {
  const project = canonicalProject(value, context.knownProjects);
  if (project === document.project) return unchanged(document);
  const text = `Project changed from ${describeProject(document.project)} to ${describeProject(project)}`;
  return recordUpdate(document, { project }, text, context.now);
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

/**
 * Appends a comment dated `now` and records `Comment added`. The text is trimmed.
 *
 * @throws Error with a user-presentable message when the text is empty.
 */
export function addComment(document: TaskDocument, text: string, now: Date): TaskDocument {
  const trimmed = text.replace(/\r\n?/g, '\n').trim();
  if (trimmed === '') throw new Error("A comment can't be empty.");
  assertSafeBodyText(trimmed, 'comment');
  const comment = { at: formatLogTimestamp(now), text: trimmed };
  const { document: updated } = recordUpdate(document, { comments: [...document.comments, comment] }, 'Comment added', now);
  return updated;
}

/**
 * Puts a task in a column at `order`. Changing column is an update that records
 * `Moved from <old> to <new>`. Staying in the same column only changes `order`, which is not an update.
 */
export function moveToColumn(document: TaskDocument, status: Status, order: number | null, now: Date): ChangeResult {
  const target = validateStatus(status);
  if (target === document.status) return setOrder(document, order);
  return recordUpdate(
    document,
    { status: target, rawStatus: null, order },
    `Moved from ${document.status} to ${target}`,
    now,
  );
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
  return recordUpdate(
    document,
    { status: 'Done', rawStatus: null, archivedAt: null, order },
    'Restored to Done',
    now,
  ).document;
}
