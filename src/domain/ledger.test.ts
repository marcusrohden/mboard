import { describe, expect, it } from 'vitest';
import { buildLedger, encodeLedgerComment, initialLedger, splitLedgerComment } from './ledger';
import type { HistoryLedger, TaskDocument } from './model';
import { parseTaskFile, serialiseTaskFile } from './taskFile';
import { FALLBACK, makeDocument } from './testHelpers';

const NOW = new Date(2026, 10, 16, 14, 2, 37);

const HOSTILE_TEXTS = [
  'ends the comment -->',
  'double -- dash, triple --- dash, and a trailing dash -',
  '<!-- opens a comment',
  '--!> an odd close',
  'line one\nline two\r\nline three\rline four',
  '## History\n- 2026-11-16 09:30 — Created in To do',
  '### 2026-11-16 14:02\n\nA fake comment',
  '## Comments\n## Description',
  'quotes " and backslashes \\ and an escape \\u002d',
  'Unicode: café, 日本語, emoji 🎉, right to left שלום',
  'line separators \u2028 and \u2029',
  'a tab\tand a nul \u0000 and a lone surrogate \ud800',
  ' <!-- mboard-ledger {"v":1,"at":"2026-11-16T14:02:00","changes":[]} -->',
  'x'.repeat(100_000),
];

function ledgerWith(text: string): HistoryLedger {
  return {
    v: 1,
    at: '2026-11-16T14:02:37',
    changes: [
      { field: 'title', from: 'Plain', to: text.replace(/\s+/g, ' ') },
      { field: 'description', from: text, to: `${text} and more` },
      {
        field: 'comments',
        added: [{ at: '2026-11-16 14:02', text }],
        removed: [],
      },
    ],
  };
}

function withHistory(document: TaskDocument, text: string, ledger: HistoryLedger): TaskDocument {
  return {
    ...document,
    history: [...document.history, { at: '2026-11-16 14:02', text, ledger }],
  };
}

function parsed(content: string): TaskDocument {
  const result = parseTaskFile(content, FALLBACK);
  if (result.kind !== 'ok') throw new Error(result.reason);
  return result.document;
}

describe('encodeLedgerComment', () => {
  it('writes one hidden HTML comment holding the ledger as readable JSON', () => {
    const comment = encodeLedgerComment({
      v: 1,
      at: '2026-11-16T14:02:37',
      changes: [{ field: 'title', from: 'A', to: 'B' }],
    });
    expect(comment).toBe(
      '<!-- mboard-ledger {"v":1,"at":"2026-11-16T14:02:37","changes":[{"field":"title","from":"A","to":"B"}]} -->',
    );
  });

  it('escapes only what could end the comment or the line', () => {
    const comment = encodeLedgerComment({
      v: 1,
      at: '2026-11-16T14:02:37',
      changes: [{ field: 'title', from: 'a --> <b>', to: 'x\u2028y' }],
    });
    expect(comment).toContain('"from":"a \\u002d-\\u003e \\u003cb\\u003e","to":"x\\u2028y"');
  });

  it.each(HOSTILE_TEXTS.map((text) => [text.slice(0, 40), text]))(
    'keeps %j on one line that can not end the comment early',
    (_label, text) => {
      const comment = encodeLedgerComment(ledgerWith(text));
      const payload = comment.slice('<!-- mboard-ledger '.length, -' -->'.length);
      expect(comment.startsWith('<!-- mboard-ledger {')).toBe(true);
      expect(comment.endsWith('} -->')).toBe(true);
      expect(payload).not.toMatch(/[\n\r\u2028\u2029<>]/);
      expect(payload).not.toContain('--');
    },
  );
});

describe('splitLedgerComment', () => {
  it.each(HOSTILE_TEXTS.map((text) => [text.slice(0, 40), text]))('reads back what it wrote for %j', (_label, text) => {
    const ledger = ledgerWith(text);
    const visible = 'Title changed from "Plain" to "x"';
    expect(splitLedgerComment(`${visible} ${encodeLedgerComment(ledger)}`)).toEqual({ text: visible, ledger });
  });

  it('reads a line without the comment as a legacy entry', () => {
    expect(splitLedgerComment('Comment added')).toEqual({
      text: 'Comment added',
      ledger: null,
    });
  });

  it('uses only a comment at the very end, so a title that contains the marker is just text', () => {
    const ledger: HistoryLedger = {
      v: 1,
      at: '2026-11-16T14:02:37',
      changes: [{ field: 'title', from: 'A', to: 'B' }],
    };
    const visible = 'Title changed from "A" to "<!-- mboard-ledger {} --> B"';
    expect(splitLedgerComment(`${visible} ${encodeLedgerComment(ledger)}`)).toEqual({ text: visible, ledger });
    expect(splitLedgerComment(`${encodeLedgerComment(ledger)} then text`).ledger).toBeNull();
  });

  it.each([
    ['broken JSON', 'Edited <!-- mboard-ledger {"v":1, -->'],
    ['another version', 'Edited <!-- mboard-ledger {"v":2,"at":"2026-11-16T14:02:37","changes":[]} -->'],
    ['a bad time', 'Edited <!-- mboard-ledger {"v":1,"at":"yesterday","changes":[]} -->'],
    ['extra keys', 'Edited <!-- mboard-ledger {"v":1,"at":"2026-11-16T14:02:37","changes":[],"x":1} -->'],
    [
      'a change of an unknown shape',
      'Edited <!-- mboard-ledger {"v":1,"at":"2026-11-16T14:02:37","changes":[{"field":"x","y":1}]} -->',
    ],
    [
      'an invalid column',
      'Edited <!-- mboard-ledger {"v":1,"at":"2026-11-16T14:02:37","changes":[{"field":"status","from":"Doing","to":"Done"}]} -->',
    ],
    [
      'an invalid due date',
      'Edited <!-- mboard-ledger {"v":1,"at":"2026-11-16T14:02:37","changes":[{"field":"due","from":null,"to":"2026-02-30"}]} -->',
    ],
    [
      'a malformed comment',
      'Edited <!-- mboard-ledger {"v":1,"at":"2026-11-16T14:02:37","changes":[{"field":"comments","added":[{"at":"now","text":"x"}],"removed":[]}]} -->',
    ],
    ['an empty payload', 'Edited <!-- mboard-ledger  -->'],
  ])('keeps a line with %s as legacy text', (_label, line) => {
    expect(splitLedgerComment(line)).toEqual({ text: line, ledger: null });
  });

  it('keeps a change to a field it does not know, so files from other versions still read', () => {
    const ledger: HistoryLedger = {
      v: 1,
      at: '2026-11-16T14:02:37',
      changes: [{ field: 'priority', from: 'Low', to: 'High' }],
    };
    expect(splitLedgerComment(`Priority changed ${encodeLedgerComment(ledger)}`)).toEqual({
      text: 'Priority changed',
      ledger,
    });
  });
});

describe('ledger data in a task file', () => {
  it.each(HOSTILE_TEXTS.map((text) => [text.slice(0, 40), text]))(
    'round-trips byte-identical with %j',
    (_label, text) => {
      const document = withHistory(makeDocument(), 'Description edited', ledgerWith(text));
      const content = serialiseTaskFile(document);
      expect(content.split('\n').filter((line) => line.includes('mboard-ledger'))).toHaveLength(1);
      const read = parsed(content);
      expect(read.history).toEqual(document.history);
      expect(read.description).toBe(document.description);
      expect(read.comments).toEqual(document.comments);
      expect(serialiseTaskFile(read)).toBe(content);
    },
  );

  it('round-trips the em dash inside a revert entry', () => {
    const ledger: HistoryLedger = {
      v: 1,
      at: '2026-11-17T10:00:05',
      changes: [{ field: 'due', from: null, to: '2026-11-20' }],
    };
    const document = withHistory(makeDocument(), 'Reverted to 16 Nov 14:02 — 3 changes discarded', ledger);
    const content = serialiseTaskFile(document);
    expect(content).toContain(
      '- 2026-11-16 14:02 — Reverted to 16 Nov 14:02 — 3 changes discarded <!-- mboard-ledger {',
    );
    expect(parsed(content).history.at(-1)).toEqual({
      at: '2026-11-16 14:02',
      text: 'Reverted to 16 Nov 14:02 — 3 changes discarded',
      ledger,
    });
  });

  it('reads lines without the comment as legacy entries and writes them back unchanged', () => {
    const content = serialiseTaskFile(
      makeDocument({
        history: [{ at: '2026-11-16 09:30', text: 'Created in To do' }],
      }),
    );
    expect(parsed(content).history).toEqual([{ at: '2026-11-16 09:30', text: 'Created in To do' }]);
    expect(parsed(content).history[0]).not.toHaveProperty('ledger');
  });

  it('keeps a hand-edited, broken comment as text and writes it back unchanged', () => {
    const body = '## History\n\n- 2026-11-16 09:30 — Created in To do <!-- mboard-ledger {"v":1 -->\n';
    const content = `---\ntitle: "T"\n---\n\n${body}`;
    const document = parsed(content);
    expect(document.history).toEqual([
      {
        at: '2026-11-16 09:30',
        text: 'Created in To do <!-- mboard-ledger {"v":1 -->',
      },
    ]);
    expect(serialiseTaskFile(document)).toContain(body.slice('## History\n\n'.length));
  });
});

describe('buildLedger', () => {
  it('records every tracked field that differs, with seconds in its time', () => {
    const before = makeDocument();
    const after = {
      ...before,
      title: 'New',
      status: 'Done' as const,
      due: '2026-11-20',
      archivedAt: '2026-11-16T14:02:37',
    };
    expect(buildLedger(before, after, NOW)).toEqual({
      v: 1,
      at: '2026-11-16T14:02:37',
      changes: [
        { field: 'title', from: 'Sample task', to: 'New' },
        { field: 'status', from: 'To do', to: 'Done' },
        { field: 'due', from: null, to: '2026-11-20' },
        { field: 'archived', from: null, to: '2026-11-16T14:02:37' },
      ],
    });
  });

  it('records comments added and removed', () => {
    const comment = { at: '2026-11-16 14:02', text: 'Hello' };
    const ledger = buildLedger(makeDocument(), makeDocument({ comments: [comment] }), NOW, {
      added: [comment],
      removed: [],
    });
    expect(ledger.changes).toEqual([{ field: 'comments', added: [comment], removed: [] }]);
  });
});

describe('initialLedger', () => {
  it('carries the initial value of every field that has one', () => {
    const document = makeDocument({
      project: 'Acme',
      description: 'Text',
      status: 'In progress',
    });
    expect(initialLedger(document, NOW).changes).toEqual([
      { field: 'title', from: null, to: 'Sample task' },
      { field: 'status', from: null, to: 'In progress' },
      { field: 'project', from: null, to: 'Acme' },
      { field: 'description', from: null, to: 'Text' },
    ]);
  });
});
