/** The board's fixed columns, left to right. A task's column is its status. */
export const COLUMNS = ['To do', 'In progress', 'Done'] as const;

/** Who has to take the next step on a task. */
export const RESPONSIBILITIES = ['Me', 'Client', 'Internal'] as const;

export type Status = (typeof COLUMNS)[number];
export type Responsibility = (typeof RESPONSIBILITIES)[number];

/** The task file's path relative to the board folder, with `/` separators, for example `tasks/Fix login bug.md`. */
export type TaskId = string;

/** A calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;

/** A local date and time, `YYYY-MM-DDTHH:mm:ss`, with no offset. */
export type LocalDateTime = string;

/** A dated note on a task. `at` is `YYYY-MM-DD HH:mm`, or an empty string when the note has no date. */
export interface TaskComment {
  at: string;
  text: string;
}

/**
 * A change to one single-value field, as stored in the task file: `null` means empty. `field` is one of
 * the ledger's tracked fields, or a field another version of mboard tracked, which is kept but never reverted.
 */
export interface LedgerValueChange {
  field: string;
  from: string | null;
  to: string | null;
}

/** The comments one update added to the task and removed from it. */
export interface LedgerCommentsChange {
  field: 'comments';
  added: readonly TaskComment[];
  removed: readonly TaskComment[];
}

export type LedgerChange = LedgerValueChange | LedgerCommentsChange;

/**
 * What one in-app update changed, kept with its history entry so that the update can be reverted.
 * `at` is the update's local time with seconds.
 */
export interface HistoryLedger {
  v: 1;
  at: LocalDateTime;
  changes: readonly LedgerChange[];
}

/**
 * One line of a task's history log. `at` is `YYYY-MM-DD HH:mm`, or an empty string when the line has no date.
 * `ledger` is missing on entries written before mboard kept a ledger, and on lines it couldn't read.
 */
export interface HistoryEntry {
  at: string;
  text: string;
  ledger?: HistoryLedger;
}

/**
 * The history entry a revert was asked for, as the person saw it: the length of the history and that
 * entry's time and text. Main refuses the revert when the file no longer matches.
 */
export interface RevertExpectation {
  historyLength: number;
  at: string;
  text: string;
}

/** A task as the renderer sees it. */
export interface Task {
  id: TaskId;
  title: string;
  status: Status;
  responsibility: Responsibility;
  project: string | null;
  due: LocalDate | null;
  created: LocalDateTime;
  updated: LocalDateTime;
  archivedAt: LocalDateTime | null;
  isArchived: boolean;
  order: number | null;
  description: string;
  comments: TaskComment[];
  history: HistoryEntry[];
}

/** A frontmatter entry the app doesn't know about, kept so that writes don't lose it. */
export interface UnknownFrontmatterEntry {
  key: unknown;
  value: unknown;
}

/**
 * A parsed task file, without its location.
 *
 * `rawStatus` and `rawResponsibility` hold the file's own spelling when it isn't one the app
 * recognises exactly (for example `in progress` or an unknown value). They are written back until
 * the field is changed.
 */
export interface TaskDocument {
  title: string;
  status: Status;
  rawStatus: string | null;
  responsibility: Responsibility;
  rawResponsibility: string | null;
  project: string | null;
  due: LocalDate | null;
  created: LocalDateTime;
  updated: LocalDateTime;
  archivedAt: LocalDateTime | null;
  order: number | null;
  description: string;
  comments: readonly TaskComment[];
  history: readonly HistoryEntry[];
  unknownFrontmatter: readonly UnknownFrontmatterEntry[];
}

/** The fields a new task is created from. */
export interface NewTaskInput {
  title: string;
  status: Status;
  responsibility: Responsibility;
  project: string | null;
  due: LocalDate | null;
  description: string;
}

/** A single-field edit to an existing task. */
export type TaskEdit =
  | { field: 'title'; value: string }
  | { field: 'description'; value: string }
  | { field: 'project'; value: string | null }
  | { field: 'responsibility'; value: Responsibility }
  | { field: 'due'; value: LocalDate | null };

/** Whether `value` is exactly one of the column names. */
export function isStatus(value: unknown): value is Status {
  return COLUMNS.some((column) => column === value);
}

/** Whether `value` is exactly one of the responsibility names. */
export function isResponsibility(value: unknown): value is Responsibility {
  return RESPONSIBILITIES.some((responsibility) => responsibility === value);
}

function matchIgnoringCase<T extends string>(options: readonly T[], raw: string): T | null {
  const wanted = raw.trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === wanted) ?? null;
}

/** Matches a raw value to a column, ignoring case and surrounding spaces. Returns `null` when none matches. */
export function matchStatus(raw: string): Status | null {
  return matchIgnoringCase(COLUMNS, raw);
}

/** Matches a raw value to a responsibility, ignoring case and surrounding spaces. Returns `null` when none matches. */
export function matchResponsibility(raw: string): Responsibility | null {
  return matchIgnoringCase(RESPONSIBILITIES, raw);
}
