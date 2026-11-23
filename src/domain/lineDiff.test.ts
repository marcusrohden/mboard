import { describe, expect, it } from 'vitest';
import { diffHunks, diffLines, formatHunkHeader, summariseDiff, type DiffLine } from './lineDiff';

function unified(lines: readonly DiffLine[]): string[] {
  const sign = { unchanged: ' ', added: '+', removed: '-' } as const;
  return lines.map((line) => `${sign[line.kind]}${line.text}`);
}

function textAfter(lines: readonly DiffLine[]): string {
  return lines
    .filter((line) => line.kind !== 'removed')
    .map((line) => line.text)
    .join('\n');
}

function textBefore(lines: readonly DiffLine[]): string {
  return lines
    .filter((line) => line.kind !== 'added')
    .map((line) => line.text)
    .join('\n');
}

describe('diffLines', () => {
  it('marks every line unchanged when the texts are the same', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([
      { kind: 'unchanged', text: 'a', before: 1, after: 1 },
      { kind: 'unchanged', text: 'b', before: 2, after: 2 },
    ]);
  });

  it('treats an empty text as having no lines', () => {
    expect(diffLines('', '')).toEqual([]);
    expect(unified(diffLines('', 'One\nTwo'))).toEqual(['+One', '+Two']);
    expect(unified(diffLines('One', ''))).toEqual(['-One']);
  });

  it('shows a changed line as removed, then added, with the lines around it unchanged', () => {
    expect(diffLines('Intro\nOld ask\nOutro', 'Intro\nNew ask\nOutro')).toEqual([
      { kind: 'unchanged', text: 'Intro', before: 1, after: 1 },
      { kind: 'removed', text: 'Old ask', before: 2, after: null },
      { kind: 'added', text: 'New ask', before: null, after: 2 },
      { kind: 'unchanged', text: 'Outro', before: 3, after: 3 },
    ]);
  });

  it('keeps the most lines it can, rather than replacing everything after the first change', () => {
    expect(unified(diffLines('a\nb\nc\nd', 'a\nx\nc\nd\ne'))).toEqual([' a', '-b', '+x', ' c', ' d', '+e']);
    expect(unified(diffLines('one\ntwo\nthree', 'zero\none\nthree'))).toEqual(['+zero', ' one', '-two', ' three']);
  });

  it('copes with repeated and blank lines', () => {
    const lines = diffLines('-\n\n-\n\n-', '-\n\n\n-');
    expect(summariseDiff(lines)).toEqual({ added: 0, removed: 1 });
    expect(textAfter(lines)).toBe('-\n\n\n-');
  });

  it('always rebuilds both texts from the diff', () => {
    const pairs: Array<[string, string]> = [
      ['a\nb\nc', 'c\nb\na'],
      ['same', 'same'],
      ['x\ny\nz\nx\ny\nz', 'y\nz\nx\nq\nz'],
      ['', 'only after'],
      ['line 1\nline 2\nline 3\nline 4', 'line 0\nline 2\nline 4\nline 5'],
    ];
    for (const [before, after] of pairs) {
      const lines = diffLines(before, after);
      expect(textBefore(lines)).toBe(before);
      expect(textAfter(lines)).toBe(after);
    }
  });

  it('still gives a correct diff of very long texts that share nothing in the middle', () => {
    const before = ['start', ...Array.from({ length: 1500 }, (_, n) => `before ${n}`), 'end'].join('\n');
    const after = ['start', ...Array.from({ length: 1500 }, (_, n) => `after ${n}`), 'end'].join('\n');
    const lines = diffLines(before, after);
    expect(summariseDiff(lines)).toEqual({ added: 1500, removed: 1500 });
    expect(textBefore(lines)).toBe(before);
    expect(textAfter(lines)).toBe(after);
  });
});

describe('diffHunks', () => {
  const tenLines = Array.from({ length: 10 }, (_, n) => `line ${n + 1}`);

  it('has no hunks when nothing changed', () => {
    expect(diffHunks(diffLines('a\nb', 'a\nb'))).toEqual([]);
  });

  it('shows three unchanged lines either side of a change, as git does', () => {
    const after = tenLines.map((line) => (line === 'line 5' ? 'line five' : line));
    const [hunk, ...rest] = diffHunks(diffLines(tenLines.join('\n'), after.join('\n')));
    expect(rest).toEqual([]);
    expect(hunk === undefined ? '' : formatHunkHeader(hunk)).toBe('@@ -2,7 +2,7 @@');
    expect(unified(hunk?.lines ?? [])).toEqual([
      ' line 2',
      ' line 3',
      ' line 4',
      '-line 5',
      '+line five',
      ' line 6',
      ' line 7',
      ' line 8',
    ]);
  });

  it('splits changes far apart into separate hunks and joins ones whose context meets', () => {
    const farApart = tenLines.map((line) => (line === 'line 1' || line === 'line 10' ? `${line}!` : line));
    expect(diffHunks(diffLines(tenLines.join('\n'), farApart.join('\n'))).map(formatHunkHeader)).toEqual([
      '@@ -1,4 +1,4 @@',
      '@@ -7,4 +7,4 @@',
    ]);
    const close = tenLines.map((line) => (line === 'line 2' || line === 'line 8' ? `${line}!` : line));
    expect(diffHunks(diffLines(tenLines.join('\n'), close.join('\n'))).map(formatHunkHeader)).toEqual([
      '@@ -1,10 +1,10 @@',
    ]);
  });

  it('numbers a hunk that only adds or only removes from the line it follows', () => {
    expect(diffHunks(diffLines('', 'new')).map(formatHunkHeader)).toEqual(['@@ -0,0 +1 @@']);
    expect(diffHunks(diffLines('old', '')).map(formatHunkHeader)).toEqual(['@@ -1 +0,0 @@']);
    expect(diffHunks(diffLines('a\nb', 'a\nb\nc'), 0).map(formatHunkHeader)).toEqual(['@@ -2,0 +3 @@']);
  });
});
