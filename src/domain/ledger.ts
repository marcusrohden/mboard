import type {
  HistoryLedger,
  LedgerChange,
  LedgerCommentsChange,
  LedgerValueChange,
  TaskComment,
  TaskDocument,
} from './model';
import { isStatus } from './model';
import {
  formatLocalDateTime,
  normaliseLogTimestamp,
  normaliseTimestamp,
  parseLocalDate,
} from './time';

/** The comments one update added and removed. */
export interface CommentsDelta {
  added: readonly TaskComment[];
  removed: readonly TaskComment[];
}

interface TrackedField {
  read(document: TaskDocument): string | null;
  write(document: TaskDocument, value: string | null): TaskDocument;
  accepts(value: string | null): boolean;
}

const LEDGER_VERSION = 1;
const COMMENT_OPENING = '<!-- mboard-ledger ';
const COMMENT_CLOSING = ' -->';
const LINE_MARKER = ` ${COMMENT_OPENING}`;
const COMMENTS_FIELD = 'comments';
const UNSAFE_IN_COMMENT = /[<>\u2028\u2029]|-(?=-)/g;

function isText(value: string | null): boolean {
  return value === null || typeof value === 'string';
}

function isLocalDateTime(value: string | null): boolean {
  return value === null || normaliseTimestamp(value) === value;
}

const TRACKED_FIELDS: Readonly<Record<string, TrackedField>> = {
  title: {
    read: (document) => document.title,
    write: (document, value) =>
      value === null ? document : { ...document, title: value },
    accepts: isText,
  },
  status: {
    read: (document) => document.status,
    write: (document, value) =>
      isStatus(value)
        ? { ...document, status: value, rawStatus: null }
        : document,
    accepts: (value) => value === null || isStatus(value),
  },
  project: {
    read: (document) => document.project,
    write: (document, value) => ({ ...document, project: value }),
    accepts: isText,
  },
  due: {
    read: (document) => document.due,
    write: (document, value) => ({ ...document, due: value }),
    accepts: (value) => value === null || parseLocalDate(value) !== null,
  },
  description: {
    read: (document) => document.description,
    write: (document, value) => ({ ...document, description: value ?? '' }),
    accepts: isText,
  },
  archived: {
    read: (document) => document.archivedAt,
    write: (document, value) => ({ ...document, archivedAt: value }),
    accepts: isLocalDateTime,
  },
};

/** Whether a ledger change records comments rather than a single field. */
export function isCommentsChange(
  change: LedgerChange,
): change is LedgerCommentsChange {
  return 'added' in change;
}

/**
 * Writes one value change back into a document. A field this version doesn't track is left alone.
 * `null` for the title or column, which can't be empty, leaves the current value.
 */
export function writeTrackedValue(
  document: TaskDocument,
  change: LedgerValueChange,
  value: string | null,
): TaskDocument {
  return TRACKED_FIELDS[change.field]?.write(document, value) ?? document;
}

/**
 * The value changes between two versions of a task, one per tracked field that differs: title, status,
 * project, due, description and archived, in that order. Dropping a field from the board
 * means dropping its row from the tracked fields; older ledger data that names it is still read and kept,
 * but never reverted.
 */
export function valueChangesBetween(
  before: TaskDocument,
  after: TaskDocument,
): LedgerValueChange[] {
  return Object.entries(TRACKED_FIELDS).flatMap(([field, tracked]) => {
    const from = tracked.read(before);
    const to = tracked.read(after);
    return from === to ? [] : [{ field, from, to }];
  });
}

function commentsChange(delta: CommentsDelta | null): LedgerCommentsChange[] {
  if (
    delta === null ||
    (delta.added.length === 0 && delta.removed.length === 0)
  )
    return [];
  return [
    {
      field: COMMENTS_FIELD,
      added: delta.added.map(copyComment),
      removed: delta.removed.map(copyComment),
    },
  ];
}

function copyComment({ at, text }: TaskComment): TaskComment {
  return { at, text };
}

/** The ledger for an update that turned `before` into `after` at `now`, plus any comments it added or removed. */
export function buildLedger(
  before: TaskDocument,
  after: TaskDocument,
  now: Date,
  comments: CommentsDelta | null = null,
): HistoryLedger {
  return {
    v: LEDGER_VERSION,
    at: formatLocalDateTime(now),
    changes: [
      ...valueChangesBetween(before, after),
      ...commentsChange(comments),
    ],
  };
}

/** The ledger for creating a task: every tracked field that starts with a value, each from `null`. */
export function initialLedger(
  document: TaskDocument,
  now: Date,
): HistoryLedger {
  const changes = Object.entries(TRACKED_FIELDS).flatMap(([field, tracked]) => {
    const to = tracked.read(document);
    return to === null || to === '' ? [] : [{ field, from: null, to }];
  });
  return { v: LEDGER_VERSION, at: formatLocalDateTime(now), changes };
}

function canonicalChange(change: LedgerChange): LedgerChange {
  if (isCommentsChange(change)) {
    return {
      field: COMMENTS_FIELD,
      added: change.added.map(copyComment),
      removed: change.removed.map(copyComment),
    };
  }
  return { field: change.field, from: change.from, to: change.to };
}

function escapeForComment(json: string): string {
  return json.replace(
    UNSAFE_IN_COMMENT,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * Encodes a ledger as the hidden HTML comment appended to its history line:
 * `<!-- mboard-ledger {json} -->`. The JSON stays readable; only `<`, `>`, a `-` that starts a `--` run,
 * U+2028 and U+2029 become `\uXXXX` escapes, so the comment is always one line and nothing inside it can
 * close it early. JSON already escapes line breaks and control characters.
 */
export function encodeLedgerComment(ledger: HistoryLedger): string {
  const canonical = {
    v: ledger.v,
    at: ledger.at,
    changes: ledger.changes.map(canonicalChange),
  };
  return `${COMMENT_OPENING}${escapeForComment(JSON.stringify(canonical))}${COMMENT_CLOSING}`;
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: PlainObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function readStoredValue(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

function readComment(value: unknown): TaskComment | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['at', 'text']))
    return null;
  const { at, text } = value;
  if (typeof at !== 'string' || typeof text !== 'string') return null;
  if (at !== '' && normaliseLogTimestamp(at) !== at) return null;
  return { at, text };
}

function readComments(value: unknown): TaskComment[] | null {
  if (!Array.isArray(value)) return null;
  const comments = value.map(readComment);
  return comments.every((comment) => comment !== null)
    ? (comments as TaskComment[])
    : null;
}

function readCommentsChange(value: PlainObject): LedgerCommentsChange | null {
  const added = readComments(value['added']);
  const removed = readComments(value['removed']);
  return added === null || removed === null
    ? null
    : { field: COMMENTS_FIELD, added, removed };
}

function readValueChange(value: PlainObject): LedgerValueChange | null {
  const { field } = value;
  const from = readStoredValue(value['from']);
  const to = readStoredValue(value['to']);
  if (
    typeof field !== 'string' ||
    field === '' ||
    field === COMMENTS_FIELD ||
    from === undefined ||
    to === undefined
  ) {
    return null;
  }
  const tracked = TRACKED_FIELDS[field];
  if (tracked !== undefined && !(tracked.accepts(from) && tracked.accepts(to)))
    return null;
  return { field, from, to };
}

function readChange(value: unknown): LedgerChange | null {
  if (!isPlainObject(value)) return null;
  if (
    hasExactKeys(value, ['field', 'added', 'removed']) &&
    value['field'] === COMMENTS_FIELD
  ) {
    return readCommentsChange(value);
  }
  return hasExactKeys(value, ['field', 'from', 'to'])
    ? readValueChange(value)
    : null;
}

function readLedger(value: unknown): HistoryLedger | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['v', 'at', 'changes']))
    return null;
  const { v, at, changes } = value;
  if (
    v !== LEDGER_VERSION ||
    typeof at !== 'string' ||
    normaliseTimestamp(at) !== at ||
    !Array.isArray(changes)
  ) {
    return null;
  }
  const read = changes.map(readChange);
  return read.every((change) => change !== null)
    ? { v: LEDGER_VERSION, at, changes: read as LedgerChange[] }
    : null;
}

function decodeLedger(payload: string): HistoryLedger | null {
  try {
    return readLedger(JSON.parse(payload));
  } catch {
    return null;
  }
}

/**
 * Splits a history line's text into the visible text and its ledger. Only a comment at the very end of the
 * line counts, so history text that quotes the marker (say, in a title) stays text. A line without the
 * comment, or whose comment can't be read as a version 1 ledger, is a legacy line: its whole text is kept
 * and it has no ledger.
 */
export function splitLedgerComment(lineText: string): {
  text: string;
  ledger: HistoryLedger | null;
} {
  const legacy = { text: lineText, ledger: null };
  if (!lineText.endsWith(COMMENT_CLOSING)) return legacy;
  const markerAt = lineText.lastIndexOf(LINE_MARKER);
  const payloadStart = markerAt + LINE_MARKER.length;
  const payloadEnd = lineText.length - COMMENT_CLOSING.length;
  if (markerAt === -1 || payloadStart > payloadEnd) return legacy;
  const payload = lineText.slice(payloadStart, payloadEnd);
  if (/[<>]/.test(payload)) return legacy;
  const ledger = decodeLedger(payload);
  return ledger === null
    ? legacy
    : { text: lineText.slice(0, markerAt), ledger };
}
