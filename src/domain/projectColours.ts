import { isMap, isScalar, parseDocument, type Document, type Pair, type YAMLMap } from 'yaml';
import { FRONTMATTER_FENCE, readFrontmatterMap, splitFrontmatter } from './frontmatter';
import { normaliseProject } from './projects';

/** The board folder's file of project settings, next to `README.md`. */
export const PROJECTS_FILE_NAME = 'projects.md';

/** The colours a project's name can be shown in. Each has a light and a dark shade readable on a card. */
export const PROJECT_COLOURS = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'brown',
] as const;

export type ProjectColour = (typeof PROJECT_COLOURS)[number];

/** Each coloured project's name, as `projects.md` spells it, with its colour. */
export type ProjectColours = Readonly<Record<string, ProjectColour>>;

/** What `projects.md` holds, or why it can't be read. */
export type ProjectsFileContent = { kind: 'ok'; colours: ProjectColours } | { kind: 'unreadable'; reason: string };

const COLOURS_KEY = 'colours';

const NEW_FILE_BODY = `
# Projects

mboard keeps this board's project settings here. Under \`colours\`, each project's name has one of these colours on the board: ${PROJECT_COLOURS.join(', ')}. Names match ignoring case. Change them in mboard, or edit this file.
`;

/** Whether `value` is one of the palette's colours. */
export function isProjectColour(value: unknown): value is ProjectColour {
  return typeof value === 'string' && (PROJECT_COLOURS as readonly string[]).includes(value);
}

/**
 * Reads `projects.md`. Only `colours` in its frontmatter matters: a mapping from project name to a palette
 * colour. Entries whose name isn't text or whose colour isn't in the palette are skipped, and a file
 * without frontmatter has no colours. Frontmatter that isn't a valid YAML mapping makes the file unreadable.
 */
export function parseProjectsFile(content: string): ProjectsFileContent {
  const { frontmatter } = splitFrontmatter(content);
  if (frontmatter === null) return { kind: 'ok', colours: {} };
  const properties = readFrontmatterMap(frontmatter);
  if (typeof properties === 'string') return { kind: 'unreadable', reason: properties };
  const listed = properties.get(COLOURS_KEY);
  if (!(listed instanceof Map)) return { kind: 'ok', colours: {} };
  const entries = [...listed].flatMap(([name, colour]): Array<[string, ProjectColour]> => {
    const project = typeof name === 'string' ? normaliseProject(name) : null;
    return project !== null && isProjectColour(colour) ? [[project, colour]] : [];
  });
  return { kind: 'ok', colours: Object.fromEntries(entries) };
}

/** Indexes colours by lower-case project name, for lookups that ignore case. A later spelling wins. */
export function projectColourIndex(colours: ProjectColours): ReadonlyMap<string, ProjectColour> {
  return new Map(Object.entries(colours).map(([project, colour]) => [project.toLowerCase(), colour]));
}

/** A project's colour, matched ignoring case, or `null` when it has none. */
export function projectColourOf(
  project: string | null,
  index: ReadonlyMap<string, ProjectColour>,
): ProjectColour | null {
  return project === null ? null : (index.get(project.toLowerCase()) ?? null);
}

function isEntryFor(pair: Pair, wanted: string): boolean {
  const key = isScalar(pair.key) ? pair.key.value : pair.key;
  return typeof key === 'string' && normaliseProject(key)?.toLowerCase() === wanted;
}

function coloursMap(document: Document): YAMLMap {
  const existing = document.get(COLOURS_KEY);
  if (isMap(existing)) return existing;
  const created = document.createNode({}) as YAMLMap;
  document.set(COLOURS_KEY, created);
  return created;
}

/**
 * The text of `projects.md` once `project` has `colour`, or no colour when `colour` is `null`. Any entry
 * for the project, matched ignoring case, is replaced. Other frontmatter, comments and the body are kept.
 * `content` is `null` when the file doesn't exist yet, which starts it with a short explanation.
 *
 * @throws Error when the existing frontmatter isn't a valid YAML mapping. Check with `parseProjectsFile`.
 */
export function withProjectColour(content: string | null, project: string, colour: ProjectColour | null): string {
  const { frontmatter, body } =
    content === null ? { frontmatter: null, body: NEW_FILE_BODY } : splitFrontmatter(content);
  const document: Document = parseDocument(frontmatter ?? '', { schema: 'core', uniqueKeys: true });
  if (document.errors.length > 0) throw new Error("projects.md isn't valid YAML.");
  if (document.contents === null) document.contents = document.createNode({});
  if (!isMap(document.contents)) throw new Error("projects.md isn't a mapping of keys to values.");

  const colours = coloursMap(document);
  const wanted = project.toLowerCase();
  colours.items = colours.items.filter((pair) => !isEntryFor(pair, wanted));
  if (colour !== null) colours.set(project, colour);

  return `${FRONTMATTER_FENCE}\n${document.toString({ lineWidth: 0 })}${FRONTMATTER_FENCE}\n${body}`;
}
