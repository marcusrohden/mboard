import { Document, Scalar } from 'yaml';
import { FRONTMATTER_FENCE, readFrontmatterMap, splitFrontmatter } from './frontmatter';
import { encodeLedgerComment, splitLedgerComment } from './ledger';
import type {
  HistoryEntry,
  LocalDateTime,
  Status,
  Task,
  TaskComment,
  TaskDocument,
  TaskId,
  UnknownFrontmatterEntry,
} from './model';
import { matchStatus } from './model';
import { isProjectLink, projectValueToWrite, readProjectValue } from './projectLink';
import { formatLocalDateTime, normaliseLogTimestamp, normaliseTimestamp, parseLocalDate } from './time';

/** What the file system knows about a task file, used when the file itself lacks a value. */
export interface FileFallback {
  fileName: string;
  birthtime: Date;
  mtime: Date;
}

export type ParseResult = { kind: 'ok'; document: TaskDocument } | { kind: 'unreadable'; reason: string };

/** What writing a task file needs to know about its board. */
export interface SerialiseOptions {
  /**
   * The path, from the vault's root, of the board's projects folder, which mboard's project links point
   * into. `null` when the board isn't inside a vault, which writes links by the note's name alone.
   */
  projectNotesLinkPath: string | null;
}

const OUTSIDE_A_VAULT: SerialiseOptions = { projectNotesLinkPath: null };

const HISTORY_SEPARATOR = '—';

const COMMENTS_HEADING = /^##[ \t]+comments[ \t]*$/i;
const HISTORY_HEADING = /^##[ \t]+history[ \t]*$/i;
const DESCRIPTION_HEADING = /^##[ \t]+description[ \t]*$/i;
const COMMENT_HEADING = /^###[ \t]+(.+?)[ \t]*$/;
const HISTORY_LINE = /^-[ \t]+(.*)$/;
const DATED_HISTORY_TEXT = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})[ \t]+[—–-][ \t]+(.*)$/;
const DUE_PREFIX = /^\d{4}-\d{2}-\d{2}(?=$|[T ])/;

const DEFAULT_STATUS: Status = 'To do';
const LEGACY_RESPONSIBILITY_KEY = 'responsibility';
const STATUSES_BEFORE_WAITING: ReadonlySet<Status> = new Set<Status>(['To do', 'In progress']);
const COLUMN_FOR_LEGACY_RESPONSIBILITY: ReadonlyMap<string, Status> = new Map<string, Status>([
  ['client', 'With client'],
  ['internal', 'Internal'],
]);

const KNOWN_KEYS: ReadonlySet<unknown> = new Set([
  'title',
  'status',
  LEGACY_RESPONSIBILITY_KEY,
  'project',
  'due',
  'created',
  'updated',
  'archived',
  'order',
]);

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** Removes blank lines from the start and end of a block of text. */
export function trimBlankLines(text: string): string {
  const lines = text.split('\n');
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start] ?? '')) start += 1;
  while (end > start && isBlank(lines[end - 1] ?? '')) end -= 1;
  return lines.slice(start, end).join('\n');
}

function scalarText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function readOrder(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readDue(value: unknown): string | null {
  const text = scalarText(value)?.trim();
  if (text === undefined || !DUE_PREFIX.test(text)) return null;
  return parseLocalDate(text.slice(0, 10));
}

function readTimestamp(value: unknown): LocalDateTime | null {
  const text = scalarText(value);
  return text === null ? null : normaliseTimestamp(text);
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.md$/i, '');
}

function readTitle(value: unknown, fileName: string): string {
  const text = scalarText(value)?.replace(/\s+/g, ' ').trim();
  return text ? text : titleFromFileName(fileName);
}

interface ReadStatus {
  status: Status;
  rawStatus: string | null;
}

function columnForLegacyResponsibility(status: Status, responsibility: unknown): Status | null {
  if (!STATUSES_BEFORE_WAITING.has(status)) return null;
  const waitingOn = scalarText(responsibility)?.trim().toLowerCase();
  return waitingOn === undefined ? null : (COLUMN_FOR_LEGACY_RESPONSIBILITY.get(waitingOn) ?? null);
}

function readStatus(value: unknown, legacyResponsibility: unknown): ReadStatus {
  const text = scalarText(value)?.trim();
  if (!text) return { status: DEFAULT_STATUS, rawStatus: null };
  const matched = matchStatus(text);
  if (matched === null) return { status: DEFAULT_STATUS, rawStatus: text };
  const legacyColumn = columnForLegacyResponsibility(matched, legacyResponsibility);
  if (legacyColumn !== null) return { status: legacyColumn, rawStatus: null };
  return { status: matched, rawStatus: matched === text ? null : text };
}

function sectionBuckets(body: string): { description: string[]; comments: string[]; history: string[] } {
  const buckets = { description: [] as string[], comments: [] as string[], history: [] as string[] };
  let current = buckets.description;
  for (const line of body.split('\n')) {
    if (COMMENTS_HEADING.test(line)) current = buckets.comments;
    else if (HISTORY_HEADING.test(line)) current = buckets.history;
    else current.push(line);
  }
  return buckets;
}

function readDescription(lines: readonly string[]): string {
  const firstContent = lines.findIndex((line) => !isBlank(line));
  const withoutHeading =
    firstContent !== -1 && DESCRIPTION_HEADING.test(lines[firstContent] ?? '') ? lines.slice(firstContent + 1) : lines;
  return trimBlankLines(withoutHeading.join('\n'));
}

function readComments(lines: readonly string[]): TaskComment[] {
  const comments: TaskComment[] = [];
  let currentAt = '';
  let currentLines: string[] = [];

  const flush = (): void => {
    const text = trimBlankLines(currentLines.join('\n'));
    if (currentAt !== '' || text !== '') comments.push({ at: currentAt, text });
  };

  for (const line of lines) {
    const headingText = COMMENT_HEADING.exec(line)?.[1];
    const at = headingText === undefined ? null : normaliseLogTimestamp(headingText);
    if (at === null) {
      currentLines.push(line);
      continue;
    }
    flush();
    currentAt = at;
    currentLines = [];
  }
  flush();
  return comments;
}

function readHistoryEntry(lineText: string): HistoryEntry {
  const { text: visibleText, ledger } = splitLedgerComment(lineText);
  const dated = DATED_HISTORY_TEXT.exec(visibleText);
  const at = dated?.[1] === undefined ? null : normaliseLogTimestamp(dated[1]);
  const entry = dated === null || at === null ? { at: '', text: visibleText } : { at, text: dated[2] ?? '' };
  return ledger === null ? entry : { ...entry, ledger };
}

function readHistory(lines: readonly string[]): HistoryEntry[] {
  return lines.flatMap((line) => {
    const lineText = HISTORY_LINE.exec(line)?.[1];
    return lineText === undefined ? [] : [readHistoryEntry(lineText)];
  });
}

/**
 * Parses a task file's text.
 *
 * Reading is tolerant: a file without frontmatter is a task, an unknown status reads as To do, and
 * timestamps are read in several formats. Frontmatter that isn't a valid YAML mapping makes the file
 * unreadable.
 *
 * A file from before the Internal and With client columns may still carry `responsibility`. When its
 * status is To do or In progress and its responsibility is Client or Internal, ignoring case, the task
 * reads as With client or Internal. The key itself is never kept, so the next write drops it and writes
 * the effective status.
 */
export function parseTaskFile(content: string, fallback: FileFallback): ParseResult {
  const { frontmatter, body } = splitFrontmatter(content);
  const properties = frontmatter === null ? new Map<unknown, unknown>() : readFrontmatterMap(frontmatter);
  if (typeof properties === 'string') return { kind: 'unreadable', reason: properties };

  const { status, rawStatus } = readStatus(properties.get('status'), properties.get(LEGACY_RESPONSIBILITY_KEY));
  const { project, raw: rawProject } = readProjectValue(properties.get('project'));
  const buckets = sectionBuckets(body);
  const unknownFrontmatter: UnknownFrontmatterEntry[] = [...properties]
    .filter(([key]) => !KNOWN_KEYS.has(key))
    .map(([key, value]) => ({ key, value }));

  return {
    kind: 'ok',
    document: {
      title: readTitle(properties.get('title'), fallback.fileName),
      status,
      rawStatus,
      project,
      rawProject,
      due: readDue(properties.get('due')),
      created: readTimestamp(properties.get('created')) ?? formatLocalDateTime(fallback.birthtime),
      updated: readTimestamp(properties.get('updated')) ?? formatLocalDateTime(fallback.mtime),
      archivedAt: readTimestamp(properties.get('archived')),
      order: readOrder(properties.get('order')),
      description: readDescription(buckets.description),
      comments: readComments(buckets.comments),
      history: readHistory(buckets.history),
      unknownFrontmatter,
    },
  };
}

function doubleQuoted(text: string): Scalar<string> {
  const scalar = new Scalar(text);
  scalar.type = Scalar.QUOTE_DOUBLE;
  return scalar;
}

function projectEntry(document: TaskDocument, options: SerialiseOptions): string | Scalar<string> | null {
  const value = projectValueToWrite(document.project, document.rawProject, options.projectNotesLinkPath);
  if (value === null) return null;
  return isProjectLink(value) ? doubleQuoted(value) : value;
}

function frontmatterEntries(document: TaskDocument, options: SerialiseOptions): [unknown, unknown][] {
  const entries: [unknown, unknown][] = [
    ['title', doubleQuoted(document.title)],
    ['status', document.rawStatus ?? document.status],
  ];
  const project = projectEntry(document, options);
  if (project !== null) entries.push(['project', project]);
  if (document.due !== null) entries.push(['due', document.due]);
  entries.push(['created', document.created], ['updated', document.updated]);
  if (document.archivedAt !== null) entries.push(['archived', document.archivedAt]);
  if (document.order !== null) entries.push(['order', document.order]);
  for (const { key, value } of document.unknownFrontmatter) entries.push([key, value]);
  return entries;
}

function serialiseFrontmatter(document: TaskDocument, options: SerialiseOptions): string {
  return new Document(new Map(frontmatterEntries(document, options)), { schema: 'core' }).toString({
    lineWidth: 0,
    nullStr: '',
  });
}

function section(heading: string, content: string): string {
  return content === '' ? `## ${heading}\n` : `## ${heading}\n\n${content}\n`;
}

function commentBlock({ at, text }: TaskComment): string {
  if (at === '') return text;
  return text === '' ? `### ${at}` : `### ${at}\n\n${text}`;
}

function historyLine({ at, text, ledger }: HistoryEntry): string {
  const visible = at === '' ? `- ${text}` : `- ${at} ${HISTORY_SEPARATOR} ${text}`;
  return ledger === undefined ? visible : `${visible} ${encodeLedgerComment(ledger)}`;
}

function serialiseBody(document: TaskDocument): string {
  return [
    section('Description', document.description),
    section('Comments', document.comments.map(commentBlock).join('\n\n')),
    section('History', document.history.map(historyLine).join('\n')),
  ].join('\n');
}

/**
 * Serialises a task document to file text in the app's canonical layout: known frontmatter keys in a
 * fixed order, unknown keys after them in their original order, then the Description, Comments and
 * History sections. The project is written as the file spelled it while that still names the project, or
 * else as mboard's double-quoted link to the project's note. A file the app wrote parses and serialises back
 * to identical text.
 */
export function serialiseTaskFile(document: TaskDocument, options: SerialiseOptions = OUTSIDE_A_VAULT): string {
  const frontmatter = serialiseFrontmatter(document, options);
  return `${FRONTMATTER_FENCE}\n${frontmatter}${FRONTMATTER_FENCE}\n\n${serialiseBody(document)}`;
}

/** Builds the renderer's view of a parsed task file. */
export function toTask(document: TaskDocument, id: TaskId, isArchived: boolean): Task {
  return {
    id,
    title: document.title,
    status: document.status,
    project: document.project,
    due: document.due,
    created: document.created,
    updated: document.updated,
    archivedAt: document.archivedAt,
    isArchived,
    order: document.order,
    description: document.description,
    comments: document.comments.map((comment) => ({ ...comment })),
    history: document.history.map((entry) => ({ ...entry })),
  };
}
