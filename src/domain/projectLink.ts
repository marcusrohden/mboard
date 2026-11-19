import { isSameFileName, projectFolderName } from './fileName';
import { normaliseProject } from './projects';

/** The board folder's folder of project notes, next to `tasks/` and `archive/`. */
export const PROJECT_NOTES_FOLDER = 'projects';

/** A task file's `project` value: the project it names, and the value as the file spells it. */
export interface ProjectValue {
  project: string | null;
  raw: string | null;
}

const NO_PROJECT: ProjectValue = { project: null, raw: null };
const LINK = /^\[\[([^[\]]*)\]\]$/;
const UNLINKABLE_NAME = /[[\]|]/;
const LINK_BREAKING_PATH = /[#^[\]|]/;
const MARKDOWN_EXTENSION = /\.md$/i;
const NOTE_EXTENSION = '.md';

function linkInner(raw: string): string | null {
  return LINK.exec(raw.trim())?.[1] ?? null;
}

function namesNote(displayText: string, noteName: string | null): boolean {
  const cleaned = projectFolderName(displayText);
  return noteName === null || (cleaned !== null && isSameFileName(cleaned, noteName));
}

/**
 * The project a link names: the linked note's name, without its folder, heading or `.md`. The display text
 * after `|` gives the name's exact spelling while it still names that note once cleaned for a file name,
 * which keeps characters a note's name can't hold, as in `[[projects/Acme web|Acme: web]]`. Once the note is
 * renamed, for example in Obsidian, which rewrites the target but not the display text, the note's new name
 * wins.
 */
function linkedProject(inner: string): string | null {
  const { noteName, displayText } = linkParts(inner);
  return displayText !== null && namesNote(displayText, noteName) ? displayText : noteName;
}

function linkParts(inner: string): { noteName: string | null; displayText: string | null } {
  const separator = inner.indexOf('|');
  const target = separator === -1 ? inner : inner.slice(0, separator);
  const notePath = target.split('#')[0] ?? '';
  const noteName = normaliseProject((notePath.split('/').pop() ?? '').replace(MARKDOWN_EXTENSION, ''));
  const displayText = separator === -1 ? null : normaliseProject(inner.slice(separator + 1));
  return { noteName, displayText };
}

function scalarText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/**
 * The text of an unquoted `[[Link]]`, which YAML reads as a list holding a list holding one value, or `null`
 * for anything else.
 */
function unquotedLinkText(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const [inner] = value as unknown[];
  if (!Array.isArray(inner) || inner.length !== 1) return null;
  const text = scalarText(inner[0]);
  return text === null ? null : `[[${text}]]`;
}

/** Whether a `project` value, as a file spells it, is an Obsidian link such as `[[Acme website]]`. */
export function isProjectLink(raw: string): boolean {
  return linkInner(raw) !== null;
}

/**
 * Reads a task file's `project` value. A plain name is the project. A link names the project after the note
 * it links to, spelt as its display text while that still names the note. An unquoted link, which YAML reads
 * as a nested list, counts as a link. Anything else means no project.
 */
export function readProjectValue(value: unknown): ProjectValue {
  const raw = scalarText(value) ?? unquotedLinkText(value);
  if (raw === null) return NO_PROJECT;
  const inner = linkInner(raw);
  const project = inner === null ? normaliseProject(raw) : linkedProject(inner);
  return project === null ? NO_PROJECT : { project, raw };
}

/** The file name of a project's note in the projects folder, or `null` when nothing of the name is left. */
export function projectNoteFileName(project: string): string | null {
  const name = projectFolderName(project);
  return name === null ? null : `${name}${NOTE_EXTENSION}`;
}

/**
 * The path, from the vault's root, of the board's projects folder, as Obsidian links spell it. `null` when
 * the board isn't inside a vault, or when its path holds `#`, `^`, `[`, `]` or `|`, which would break a link,
 * so that links go by the note's name alone. `boardPathInVault` is the board folder's path inside the vault,
 * with `/` separators, and empty when the board folder is the vault itself.
 */
export function projectNotesLinkPath(boardPathInVault: string | null): string | null {
  if (boardPathInVault === null || LINK_BREAKING_PATH.test(boardPathInVault)) return null;
  const trimmed = boardPathInVault.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? PROJECT_NOTES_FOLDER : `${trimmed}/${PROJECT_NOTES_FOLDER}`;
}

function linkTo(target: string, project: string): string {
  return target === project ? `[[${target}]]` : `[[${target}|${project}]]`;
}

/**
 * The link mboard writes for a project: `[[<notes path>/<note>|<project>]]`, or `[[<note>|<project>]]` for
 * a board outside a vault, where `notesLinkPath` is `null`. The display text is left out when it would repeat
 * the note's name. A link is only ever written when it reads back as the same project; the path link falls
 * back to the short one, and `null`, meaning plain text, is left when neither does, when nothing of the name
 * is left as a note name, or when the name holds a character that would break the link.
 */
export function projectLinkFor(project: string, notesLinkPath: string | null): string | null {
  const noteName = projectFolderName(project);
  if (noteName === null || UNLINKABLE_NAME.test(project)) return null;
  const targets = notesLinkPath === null ? [noteName] : [`${notesLinkPath}/${noteName}`, noteName];
  const links = targets.map((target) => linkTo(target, project));
  return links.find((link) => readProjectValue(link).project === project) ?? null;
}

/**
 * What an update keeps of how a file spells its project. A link is kept, so that a link the person wrote to
 * a note of their own survives, unless its display text no longer names its note, as after the note was
 * renamed in Obsidian. A plain name is dropped. Whatever is dropped, the update writes mboard's link instead.
 */
export function projectSpellingAfterUpdate(raw: string | null): string | null {
  const inner = raw === null ? null : linkInner(raw);
  if (inner === null) return null;
  const { noteName, displayText } = linkParts(inner);
  return displayText === null || namesNote(displayText, noteName) ? raw : null;
}

/**
 * The `project` value to write for a task: the file's own spelling while it still names the same project,
 * otherwise mboard's link, or the plain name when the project can't be linked. `null` for no project.
 */
export function projectValueToWrite(
  project: string | null,
  raw: string | null,
  notesLinkPath: string | null,
): string | null {
  if (project === null) return null;
  if (raw !== null && readProjectValue(raw).project === project) return raw;
  return projectLinkFor(project, notesLinkPath) ?? project;
}
