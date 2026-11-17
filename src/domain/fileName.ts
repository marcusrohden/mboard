const MAX_STEM_LENGTH = 100;
const FALLBACK_STEM = 'Untitled';
const EXTENSION = '.md';

const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f/\\:*?"<>|#^[\]]/g;

function cutToLength(text: string, maxLength: number): string {
  return Array.from(text).slice(0, maxLength).join('');
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripEdgeDotsAndSpaces(text: string): string {
  return text.replace(/^[. ]+/, '').replace(/[. ]+$/, '');
}

/**
 * Turns a title into a safe file name stem: NFC-normalised, without control or link-breaking characters,
 * with whitespace collapsed, no leading dots, no trailing dots or spaces, at most 100 characters, and
 * `Untitled` when nothing is left.
 */
export function sanitiseTitle(title: string): string {
  const cleaned = collapseWhitespace(collapseWhitespace(title.normalize('NFC')).replace(FORBIDDEN_CHARACTERS, ''));
  const cut = cutToLength(stripEdgeDotsAndSpaces(cleaned), MAX_STEM_LENGTH);
  const stem = stripEdgeDotsAndSpaces(cut);
  return stem === '' ? FALLBACK_STEM : stem;
}

/** The file name for a title, for example `Fix login bug.md`. */
export function fileNameForTitle(title: string): string {
  return `${sanitiseTitle(title)}${EXTENSION}`;
}

function comparisonKey(fileName: string): string {
  return fileName.normalize('NFC').toLowerCase();
}

/**
 * Finds a free file name. A clash with `existingFileNames`, compared ignoring case, adds ` 2`, ` 3` and
 * so on before the extension. `ownFileName` is the file being renamed, which never clashes with itself.
 */
export function uniqueFileName(
  fileName: string,
  existingFileNames: Iterable<string>,
  ownFileName: string | null = null,
): string {
  const taken = new Set<string>();
  const own = ownFileName === null ? null : comparisonKey(ownFileName);
  for (const name of existingFileNames) {
    const key = comparisonKey(name);
    if (key !== own) taken.add(key);
  }
  if (!taken.has(comparisonKey(fileName))) return fileName;
  const stem = fileName.slice(0, -EXTENSION.length);
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem} ${suffix}${EXTENSION}`;
    if (!taken.has(comparisonKey(candidate))) return candidate;
  }
}
