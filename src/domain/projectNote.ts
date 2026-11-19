import { isMap, parseDocument, type Document } from 'yaml';
import { FRONTMATTER_FENCE, readFrontmatterMap, splitFrontmatter } from './frontmatter';
import { isProjectColour, type ProjectColour, type ProjectColours } from './projectColours';
import { projectNoteFileName } from './projectLink';

/** What a project note holds for the board, or why it can't be read. */
export type ProjectNoteContent = { kind: 'ok'; colour: ProjectColour | null } | { kind: 'unreadable'; reason: string };

const COLOUR_KEY = 'colour';
const MARKDOWN_EXTENSION = /\.md$/i;

function headingFor(project: string): string {
  return `# ${project}`;
}

function newNoteBody(project: string): string {
  return `${headingFor(project)}

mboard's note for the project ${project}. Its tasks link here from their \`project\` property, and \`colour\` above, when set, is the project's colour on the board. The rest of this note is yours.
`;
}

/**
 * Reads a project note. Only `colour` in its frontmatter matters, and only when it is one of the palette's
 * colours. A note without frontmatter has no colour. Frontmatter that isn't a valid YAML mapping makes the
 * note unreadable.
 */
export function parseProjectNote(content: string): ProjectNoteContent {
  const { frontmatter } = splitFrontmatter(content);
  if (frontmatter === null) return { kind: 'ok', colour: null };
  const properties = readFrontmatterMap(frontmatter);
  if (typeof properties === 'string') return { kind: 'unreadable', reason: properties };
  const colour = properties.get(COLOUR_KEY);
  return { kind: 'ok', colour: isProjectColour(colour) ? colour : null };
}

function frontmatterDocument(frontmatter: string | null): Document {
  const document: Document = parseDocument(frontmatter ?? '', { schema: 'core', uniqueKeys: true });
  if (document.errors.length > 0) throw new Error("The project note's frontmatter isn't valid YAML.");
  if (document.contents === null) document.contents = document.createNode({});
  if (!isMap(document.contents)) throw new Error("The project note's frontmatter isn't a mapping of keys to values.");
  return document;
}

function joinNote(document: Document, hadFrontmatter: boolean, body: string): string {
  const isEmpty = isMap(document.contents) && document.contents.items.length === 0;
  if (isEmpty) return hadFrontmatter ? `${FRONTMATTER_FENCE}\n${FRONTMATTER_FENCE}\n${body}` : body;
  return `${FRONTMATTER_FENCE}\n${document.toString({ lineWidth: 0 })}${FRONTMATTER_FENCE}\n${body}`;
}

/**
 * The text of a project note once its `colour` is `colour`, or once it has none when `colour` is `null`.
 * Other frontmatter, comments and the body are kept. `content` is `null` for a note that doesn't exist yet,
 * which starts it with a heading and a short explanation.
 *
 * @throws Error when the existing frontmatter isn't a valid YAML mapping. Check with `parseProjectNote`.
 */
export function withNoteColour(content: string | null, project: string, colour: ProjectColour | null): string {
  const { frontmatter, body } =
    content === null ? { frontmatter: null, body: newNoteBody(project) } : splitFrontmatter(content);
  const document = frontmatterDocument(frontmatter);
  if (colour === null) document.delete(COLOUR_KEY);
  else document.set(COLOUR_KEY, colour);
  return joinNote(document, frontmatter !== null, body);
}

/**
 * The text of a project note after its project is renamed from `from` to `to`. Only the heading mboard
 * starts a note with changes, and only while its first line is still that heading, ignoring case as project
 * names do. Everything else is the person's and stays as it is.
 */
export function withNoteHeading(content: string, from: string, to: string): string {
  const { frontmatter, body } = splitFrontmatter(content);
  const lines = body.split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() !== '');
  const heading = headingIndex === -1 ? null : lines[headingIndex];
  if (heading?.toLowerCase() !== headingFor(from).toLowerCase()) return content;
  lines[headingIndex] = headingFor(to);
  const renamedBody = lines.join('\n');
  if (frontmatter === null) return renamedBody;
  const frontmatterLines = frontmatter === '' ? '' : `${frontmatter}\n`;
  return `${FRONTMATTER_FENCE}\n${frontmatterLines}${FRONTMATTER_FENCE}\n${renamedBody}`;
}

/** How a project note's file name is matched: without `.md`, NFC-normalised and ignoring case. */
export function projectNoteKey(fileName: string): string {
  return fileName.replace(MARKDOWN_EXTENSION, '').normalize('NFC').toLowerCase();
}

/**
 * Each project's colour on the board: the colour in the project's note, or else its entry in `projects.md`.
 * `noteColours` holds each coloured note's colour by the note's name without `.md`, and `fileColours` is what
 * `projects.md` holds. Every entry of both is listed, so projects with no task yet keep their colour; then
 * each of `projects` is listed in its own spelling with its note's colour, matched the way a note is found,
 * so a name that differs from its note's name still gets the note's colour. A later entry wins.
 */
export function resolveProjectColours(
  projects: Iterable<string | null>,
  noteColours: ProjectColours,
  fileColours: ProjectColours,
): ProjectColours {
  const byNoteKey = new Map(Object.entries(noteColours).map(([name, colour]) => [projectNoteKey(name), colour]));
  const entries: Array<[string, ProjectColour]> = [...Object.entries(fileColours), ...Object.entries(noteColours)];
  for (const project of new Set(projects)) {
    const fileName = project === null ? null : projectNoteFileName(project);
    const colour = fileName === null ? undefined : byNoteKey.get(projectNoteKey(fileName));
    if (project !== null && colour !== undefined) entries.push([project, colour]);
  }
  return Object.fromEntries(entries);
}
