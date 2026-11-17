/**
 * The board's fixed columns, left to right. A task's column is its status. Internal means the task is
 * waiting on someone in my organisation, and With client means it is waiting on the client.
 */
export const COLUMNS = ['To do', 'In progress', 'Internal', 'With client', 'Done'] as const;

export type Status = (typeof COLUMNS)[number];

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

/** One line of a task's history log. `at` is `YYYY-MM-DD HH:mm`, or an empty string when the line has no date. */
export interface HistoryEntry {
  at: string;
  text: string;
}

/** A task as the renderer sees it. */
export interface Task {
  id: TaskId;
  title: string;
  status: Status;
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
 * `rawStatus` holds the file's own spelling when it isn't one the app recognises exactly (for example
 * `in progress` or an unknown value). It is written back until the status changes.
 */
export interface TaskDocument {
  title: string;
  status: Status;
  rawStatus: string | null;
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
  project: string | null;
  due: LocalDate | null;
  description: string;
}

/** A single-field edit to an existing task. */
export type TaskEdit =
  | { field: 'title'; value: string }
  | { field: 'description'; value: string }
  | { field: 'project'; value: string | null }
  | { field: 'due'; value: LocalDate | null };

/** Whether `value` is exactly one of the column names. */
export function isStatus(value: unknown): value is Status {
  return COLUMNS.some((column) => column === value);
}

/** Matches a raw value to a column, ignoring case and surrounding spaces. Returns `null` when none matches. */
export function matchStatus(raw: string): Status | null {
  const wanted = raw.trim().toLowerCase();
  return COLUMNS.find((column) => column.toLowerCase() === wanted) ?? null;
}
