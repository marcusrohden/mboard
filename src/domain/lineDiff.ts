/** Whether a line of a diff is in both texts, only in the text after, or only in the text before. */
export type DiffLineKind = 'unchanged' | 'added' | 'removed';

/**
 * One line of a line diff. `before` and `after` are its line numbers, counted from 1, in the text before and
 * the text after, or `null` where the line isn't in that text.
 */
export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  before: number | null;
  after: number | null;
}

/**
 * One `@@` section of a unified diff: a run of changes with the unchanged lines around them. Each start is the
 * first line number the hunk covers in that text, or the line it follows when it covers none there.
 */
export interface DiffHunk {
  beforeStart: number;
  beforeCount: number;
  afterStart: number;
  afterCount: number;
  lines: DiffLine[];
}

/** How many lines a diff adds and removes. */
export interface DiffSummary {
  added: number;
  removed: number;
}

/** The unchanged lines shown on each side of a change, as `git diff` shows them. */
export const DIFF_CONTEXT_LINES = 3;

/**
 * The most line pairs compared to find the fewest changes. Beyond it, the lines between the unchanged start and
 * end are shown as all removed, then all added, which is still a correct diff, only a longer one.
 */
const MAX_COMPARED_LINE_PAIRS = 1_000_000;

function linesOf(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}

function commonPrefixLength(before: readonly string[], after: readonly string[]): number {
  let length = 0;
  while (length < before.length && length < after.length && before[length] === after[length]) length += 1;
  return length;
}

function commonSuffixLength(before: readonly string[], after: readonly string[], prefix: number): number {
  let length = 0;
  while (
    length < before.length - prefix &&
    length < after.length - prefix &&
    before[before.length - 1 - length] === after[after.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function replacement(before: readonly string[], after: readonly string[]): DiffLineKind[] {
  return [...before.map((): DiffLineKind => 'removed'), ...after.map((): DiffLineKind => 'added')];
}

/**
 * The edits that turn `before` into `after` with the most lines kept, from a longest-common-subsequence table.
 * Where removing and adding are equally good, it removes first, so a changed line reads as `-` then `+`.
 */
function fewestEdits(before: readonly string[], after: readonly string[]): DiffLineKind[] {
  if (before.length * after.length > MAX_COMPARED_LINE_PAIRS) return replacement(before, after);
  const width = after.length + 1;
  const kept = new Uint32Array((before.length + 1) * width);
  const keptFrom = (i: number, j: number): number => kept[i * width + j] ?? 0;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      kept[i * width + j] =
        before[i] === after[j] ? keptFrom(i + 1, j + 1) + 1 : Math.max(keptFrom(i + 1, j), keptFrom(i, j + 1));
    }
  }
  const edits: DiffLineKind[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      edits.push('unchanged');
      i += 1;
      j += 1;
    } else if (j === after.length || (i < before.length && keptFrom(i + 1, j) >= keptFrom(i, j + 1))) {
      edits.push('removed');
      i += 1;
    } else {
      edits.push('added');
      j += 1;
    }
  }
  return edits;
}

function numberedLines(
  edits: readonly DiffLineKind[],
  before: readonly string[],
  after: readonly string[],
): DiffLine[] {
  let beforeIndex = 0;
  let afterIndex = 0;
  return edits.map((kind) => {
    if (kind === 'added') {
      afterIndex += 1;
      return { kind, text: after[afterIndex - 1] ?? '', before: null, after: afterIndex };
    }
    beforeIndex += 1;
    if (kind === 'removed') return { kind, text: before[beforeIndex - 1] ?? '', before: beforeIndex, after: null };
    afterIndex += 1;
    return { kind, text: before[beforeIndex - 1] ?? '', before: beforeIndex, after: afterIndex };
  });
}

/**
 * Every line of `before` and `after`, in order, each marked unchanged, added or removed, with the fewest added
 * and removed lines. An empty text has no lines.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const beforeLines = linesOf(before);
  const afterLines = linesOf(after);
  const prefix = commonPrefixLength(beforeLines, afterLines);
  const suffix = commonSuffixLength(beforeLines, afterLines, prefix);
  const middle = fewestEdits(
    beforeLines.slice(prefix, beforeLines.length - suffix),
    afterLines.slice(prefix, afterLines.length - suffix),
  );
  const kept = (count: number): DiffLineKind[] => Array.from({ length: count }, (): DiffLineKind => 'unchanged');
  return numberedLines([...kept(prefix), ...middle, ...kept(suffix)], beforeLines, afterLines);
}

/** How many lines `lines` adds and removes. */
export function summariseDiff(lines: readonly DiffLine[]): DiffSummary {
  return {
    added: lines.filter((line) => line.kind === 'added').length,
    removed: lines.filter((line) => line.kind === 'removed').length,
  };
}

function changedRanges(lines: readonly DiffLine[], context: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  lines.forEach((line, index) => {
    if (line.kind === 'unchanged') return;
    const start = Math.max(0, index - context);
    const end = Math.min(lines.length - 1, index + context);
    const last = ranges.at(-1);
    if (last !== undefined && start <= last[1] + 1) last[1] = end;
    else ranges.push([start, end]);
  });
  return ranges;
}

function lastNumberBefore(lines: readonly DiffLine[], index: number, side: 'before' | 'after'): number {
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    const number = lines[candidate]?.[side];
    if (number !== null && number !== undefined) return number;
  }
  return 0;
}

function hunkOf(lines: readonly DiffLine[], start: number, end: number): DiffHunk {
  const hunkLines = lines.slice(start, end + 1);
  const beforeCount = hunkLines.filter((line) => line.before !== null).length;
  const afterCount = hunkLines.filter((line) => line.after !== null).length;
  const beforeFollows = lastNumberBefore(lines, start, 'before');
  const afterFollows = lastNumberBefore(lines, start, 'after');
  return {
    beforeStart: beforeCount === 0 ? beforeFollows : beforeFollows + 1,
    beforeCount,
    afterStart: afterCount === 0 ? afterFollows : afterFollows + 1,
    afterCount,
    lines: hunkLines,
  };
}

/**
 * The changes in `lines` as unified-diff hunks, each with up to `context` unchanged lines on either side. Changes
 * whose context would touch or overlap share one hunk. A diff with no changes has no hunks.
 */
export function diffHunks(lines: readonly DiffLine[], context: number = DIFF_CONTEXT_LINES): DiffHunk[] {
  return changedRanges(lines, context).map(([start, end]) => hunkOf(lines, start, end));
}

function rangeText(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`;
}

/** A hunk's header as `git diff` writes it, for example `@@ -3,4 +3,5 @@`, leaving out a count of 1. */
export function formatHunkHeader(hunk: DiffHunk): string {
  return `@@ -${rangeText(hunk.beforeStart, hunk.beforeCount)} +${rangeText(hunk.afterStart, hunk.afterCount)} @@`;
}
