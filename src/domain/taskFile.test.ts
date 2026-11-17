import { describe, expect, it } from 'vitest';
import { parseTaskFile, serialiseTaskFile, toTask } from './taskFile';
import type { ParseResult } from './taskFile';
import type { TaskDocument } from './model';
import { FALLBACK, makeDocument } from './testHelpers';

const SPEC_EXAMPLE = `---
title: "Why is the staging build failing?"
status: With client
project: Acme website
due: 2026-11-20
created: 2026-11-16T09:30:00
updated: 2026-11-16T14:03:12
order: 2
---

## Description

The staging pipeline fails at the asset step since Friday.

## Comments

### 2026-11-16 14:02

Asked the client for the staging credentials.

## History

- 2026-11-16 09:30 — Created in To do
- 2026-11-16 10:05 — Moved from To do to In progress
- 2026-11-16 14:02 — Comment added
- 2026-11-16 14:03 — Moved from In progress to With client
`;

const LEGACY_EXAMPLE = SPEC_EXAMPLE.replace(
  'status: With client\n',
  'status: In progress\nresponsibility: Client\n',
).replace('Moved from In progress to With client', 'Responsibility changed from Me to Client');

function parseOk(content: string): TaskDocument {
  const result: ParseResult = parseTaskFile(content, FALLBACK);
  if (result.kind !== 'ok') throw new Error(`Expected a readable file but got: ${result.reason}`);
  return result.document;
}

function parseUnreadable(content: string): string {
  const result = parseTaskFile(content, FALLBACK);
  if (result.kind !== 'unreadable') throw new Error('Expected an unreadable file');
  return result.reason;
}

describe('round-trip of app-written files', () => {
  it('reproduces the spec example byte for byte', () => {
    expect(serialiseTaskFile(parseOk(SPEC_EXAMPLE))).toBe(SPEC_EXAMPLE);
  });

  it('parses the spec example into the expected fields', () => {
    expect(parseOk(SPEC_EXAMPLE)).toMatchObject({
      title: 'Why is the staging build failing?',
      status: 'With client',
      rawStatus: null,
      project: 'Acme website',
      due: '2026-11-20',
      created: '2026-11-16T09:30:00',
      updated: '2026-11-16T14:03:12',
      order: 2,
      description: 'The staging pipeline fails at the asset step since Friday.',
      comments: [{ at: '2026-11-16 14:02', text: 'Asked the client for the staging credentials.' }],
    });
    expect(parseOk(SPEC_EXAMPLE).history).toHaveLength(4);
  });

  it('writes the minimal document with empty sections and omits empty keys', () => {
    const text = serialiseTaskFile(makeDocument({ history: [] }));
    expect(text).toBe(
      [
        '---',
        'title: "Sample task"',
        'status: To do',
        'created: 2026-11-16T09:30:00',
        'updated: 2026-11-16T09:30:00',
        '---',
        '',
        '## Description',
        '',
        '## Comments',
        '',
        '## History',
        '',
      ].join('\n'),
    );
    expect(serialiseTaskFile(parseOk(text))).toBe(text);
  });

  it('writes known keys in a fixed order, with archived before order', () => {
    const text = serialiseTaskFile(
      makeDocument({ order: 1.5, archivedAt: '2026-11-17T10:00:00', project: 'P', due: '2026-12-01', status: 'Done' }),
    );
    const keys = text
      .split('\n')
      .slice(1, text.split('\n').indexOf('---', 1))
      .map((line) => line.split(':')[0]);
    expect(keys).toEqual(['title', 'status', 'project', 'due', 'created', 'updated', 'archived', 'order']);
  });

  it('round-trips a document with every feature: multi-paragraph description, many comments, quoting', () => {
    const document = makeDocument({
      title: 'He said "hi": a #title',
      project: 'true',
      description: 'First paragraph.\n\n- a list\n- of things\n\n### A heading inside\n\nAnd more.',
      comments: [
        { at: '2026-11-16 10:00', text: 'One\n\nwith two paragraphs' },
        { at: '2026-11-16 11:00', text: 'Two' },
      ],
      history: [
        { at: '2026-11-16 09:30', text: 'Created in To do' },
        { at: '2026-11-16 10:00', text: 'Comment added' },
      ],
      unknownFrontmatter: [
        { key: 'tags', value: ['a', 'b'] },
        { key: 'aliases', value: null },
        { key: 'nested', value: new Map<unknown, unknown>([['k', 'v']]) },
      ],
    });
    const text = serialiseTaskFile(document);
    expect(serialiseTaskFile(parseOk(text))).toBe(text);
    expect(parseOk(text)).toEqual(document);
  });

  it('quotes a title always and other strings only when YAML needs it', () => {
    const text = serialiseTaskFile(makeDocument({ title: 'Plain', project: '2026' }));
    expect(text).toContain('title: "Plain"');
    expect(text).toContain('project: "2026"');
    expect(serialiseTaskFile(makeDocument({ project: 'Acme website' }))).toContain('project: Acme website\n');
  });

  it('does not fold long titles', () => {
    const title = 'word '.repeat(60).trim();
    expect(serialiseTaskFile(makeDocument({ title }))).toContain(`title: "${title}"\n`);
  });

  it('keeps date strings as strings under the core schema', () => {
    const document = parseOk('---\ndue: 2026-11-20\ncreated: 2026-11-16T09:30:00\n---\n');
    expect(document.due).toBe('2026-11-20');
    expect(document.created).toBe('2026-11-16T09:30:00');
  });
});

describe('files as Obsidian re-serialises them', () => {
  const reserialised = `---
updated: "2026-11-16T14:03:12"
created: "2026-11-16T09:30:00"
due: "2026-11-20"
project: "Acme website"
status: in progress
title: Why is the staging build failing?
tags:
  - work
  - urgent
aliases:
  - staging
order: 2
---

## Description

Body text.

## Comments

## History

- 2026-11-16 09:30 — Created in To do
`;

  it('reads reordered, differently quoted keys', () => {
    expect(parseOk(reserialised)).toMatchObject({
      title: 'Why is the staging build failing?',
      status: 'In progress',
      project: 'Acme website',
      due: '2026-11-20',
      created: '2026-11-16T09:30:00',
      updated: '2026-11-16T14:03:12',
      order: 2,
      description: 'Body text.',
    });
  });

  it('keeps unknown keys, in their original order, and writes them after the known keys', () => {
    const text = serialiseTaskFile(parseOk(reserialised));
    expect(text).toContain('order: 2\ntags:\n  - work\n  - urgent\naliases:\n  - staging\n---\n');
  });

  it('keeps the raw status spelling until the status changes', () => {
    const text = serialiseTaskFile(parseOk(reserialised));
    expect(text).toContain('status: in progress\n');
  });

  it('reads flow lists as lists and writes them as block lists', () => {
    const text = serialiseTaskFile(parseOk('---\ntitle: T\ntags: [one, two]\n---\n'));
    expect(text).toContain('tags:\n  - one\n  - two\n');
  });

  it('treats `key:`, `key: null` and a missing key as empty', () => {
    for (const frontmatter of ['project:\ndue:\norder:', 'project: null\ndue: null\norder: null', 'title: T']) {
      expect(parseOk(`---\n${frontmatter}\n---\n`)).toMatchObject({ project: null, due: null, order: null });
    }
  });

  it('writes an empty unknown value as an empty property, as Obsidian does', () => {
    const text = serialiseTaskFile(parseOk('---\ntitle: T\naliases:\n---\n'));
    expect(text).toContain('aliases:\n---');
  });

  it('reads CRLF line endings and writes LF', () => {
    const crlf = SPEC_EXAMPLE.replace(/\n/g, '\r\n');
    expect(parseOk(crlf)).toEqual(parseOk(SPEC_EXAMPLE));
    expect(serialiseTaskFile(parseOk(crlf))).toBe(SPEC_EXAMPLE);
  });

  it('is case-sensitive about keys, so `Title` is an unknown key', () => {
    const document = parseOk('---\nTitle: Shouty\n---\n');
    expect(document.title).toBe('Fallback title');
    expect(document.unknownFrontmatter).toEqual([{ key: 'Title', value: 'Shouty' }]);
  });

  it('reads an order given as text', () => {
    expect(parseOk('---\norder: "3"\n---\n').order).toBe(3);
  });

  it('keeps non-string unknown keys in their position', () => {
    const text = serialiseTaskFile(parseOk('---\ntitle: T\n2024: year\nzeta: 1\n---\n'));
    expect(text).toContain('2024: year\nzeta: 1\n');
  });
});

describe('files with no usable frontmatter', () => {
  it('reads a file with no frontmatter as a task with defaults and the whole body as description', () => {
    const document = parseOk('Just some notes.\n\n## A heading\n\nMore.\n');
    expect(document).toMatchObject({
      title: 'Fallback title',
      status: 'To do',
      project: null,
      due: null,
      created: '2026-01-02T03:04:05',
      updated: '2026-06-07T08:09:10',
      description: 'Just some notes.\n\n## A heading\n\nMore.',
      comments: [],
      history: [],
    });
  });

  it('only counts frontmatter that starts on line 1', () => {
    const document = parseOk('\n---\ntitle: Not frontmatter\n---\nbody');
    expect(document.title).toBe('Fallback title');
    expect(document.description).toContain('title: Not frontmatter');
  });

  it('treats an unclosed fence as no frontmatter', () => {
    expect(parseOk('---\ntitle: T\nbody').title).toBe('Fallback title');
  });

  it('reads an empty file and an empty frontmatter block', () => {
    expect(parseOk('').title).toBe('Fallback title');
    expect(parseOk('---\n---\nbody').description).toBe('body');
  });

  it('serialises a file with no frontmatter into the canonical layout once it changes', () => {
    const text = serialiseTaskFile(parseOk('Notes.'));
    expect(text.startsWith('---\ntitle: "Fallback title"\nstatus: To do\n')).toBe(true);
    expect(text).toContain('## Description\n\nNotes.\n');
  });
});

describe('unreadable files', () => {
  it('reports invalid YAML', () => {
    expect(parseUnreadable('---\ntitle: [unclosed\n---\nbody')).toMatch(/^The frontmatter isn't valid YAML: /);
  });

  it('reports duplicate keys as invalid', () => {
    expect(parseUnreadable('---\ntitle: A\ntitle: B\n---\n')).toMatch(/isn't valid YAML/);
  });

  it('reports frontmatter that is not a mapping', () => {
    expect(parseUnreadable('---\n- a\n- b\n---\n')).toBe("The frontmatter isn't a mapping of keys to values.");
    expect(parseUnreadable('---\njust text\n---\n')).toBe("The frontmatter isn't a mapping of keys to values.");
  });
});

describe('tolerant reading of values', () => {
  it('falls back to To do for an unknown status and remembers the raw value', () => {
    expect(parseOk('---\nstatus: Blocked\n---\n')).toMatchObject({ status: 'To do', rawStatus: 'Blocked' });
  });

  it('matches the status ignoring case and surrounding spaces', () => {
    expect(parseOk('---\nstatus: "  DONE "\n---\n')).toMatchObject({ status: 'Done', rawStatus: 'DONE' });
    expect(parseOk('---\nstatus: " with CLIENT "\n---\n')).toMatchObject({
      status: 'With client',
      rawStatus: 'with CLIENT',
    });
    expect(parseOk('---\nstatus: internal\n---\n')).toMatchObject({ status: 'Internal', rawStatus: 'internal' });
  });

  it.each(['To do', 'In progress', 'Internal', 'With client', 'Done'])(
    'reads and writes the status %s exactly',
    (status) => {
      const text = serialiseTaskFile(parseOk(`---\ntitle: T\nstatus: ${status}\n---\n`));
      expect(parseOk(text)).toMatchObject({ status, rawStatus: null });
      expect(text).toContain(`\nstatus: ${status}\n`);
      expect(serialiseTaskFile(parseOk(text))).toBe(text);
    },
  );

  it.each([
    ['2026-11-16 09:30', '2026-11-16T09:30:00'],
    ['2026-11-16T09:30', '2026-11-16T09:30:00'],
    ['2026-11-16', '2026-11-16T00:00:00'],
    ['"2026-11-16 09:30:15"', '2026-11-16T09:30:15'],
  ])('reads the timestamp %s', (raw, expected) => {
    expect(parseOk(`---\ncreated: ${raw}\n---\n`).created).toBe(expected);
  });

  it('converts a timestamp with an offset to local time', () => {
    const expected = new Date('2026-11-16T09:30:00Z');
    const document = parseOk('---\ncreated: 2026-11-16T09:30:00Z\n---\n');
    const pad = (n: number): string => String(n).padStart(2, '0');
    const local = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}T${pad(expected.getHours())}:${pad(expected.getMinutes())}:00`;
    expect(document.created).toBe(local);
  });

  it('falls back to the birth time and modification time for missing or unparseable timestamps', () => {
    expect(parseOk('---\ntitle: T\n---\n')).toMatchObject({
      created: '2026-01-02T03:04:05',
      updated: '2026-06-07T08:09:10',
    });
    expect(parseOk('---\ncreated: yesterday\nupdated: 2026-13-45\n---\n')).toMatchObject({
      created: '2026-01-02T03:04:05',
      updated: '2026-06-07T08:09:10',
    });
  });

  it('leaves archived empty when it is unparseable', () => {
    expect(parseOk('---\narchived: soon\n---\n').archivedAt).toBeNull();
  });

  it('ignores an invalid due date', () => {
    expect(parseOk('---\ndue: 2026-02-30\n---\n').due).toBeNull();
    expect(parseOk('---\ndue: next week\n---\n').due).toBeNull();
  });

  it('uses the file name without .md when there is no title', () => {
    expect(parseTaskFile('---\nstatus: Done\n---\n', { ...FALLBACK, fileName: 'My note.md' })).toMatchObject({
      document: { title: 'My note' },
    });
  });

  it('normalises the project name', () => {
    expect(parseOk('---\nproject: "  Acme   website "\n---\n').project).toBe('Acme website');
  });
});

describe('body sections', () => {
  it('splits only at Comments and History headings, matched ignoring case', () => {
    const document = parseOk(
      '---\ntitle: T\n---\n\n## description\n\nText\n\n## Notes\n\nMore\n\n## COMMENTS\n\n### 2026-11-16 10:00\n\nHi\n\n## history\n\n- 2026-11-16 10:00 — Created in To do\n',
    );
    expect(document.description).toBe('Text\n\n## Notes\n\nMore');
    expect(document.comments).toEqual([{ at: '2026-11-16 10:00', text: 'Hi' }]);
    expect(document.history).toEqual([{ at: '2026-11-16 10:00', text: 'Created in To do' }]);
  });

  it('starts the description at the beginning of the body when there is no Description heading', () => {
    expect(parseOk('---\ntitle: T\n---\n\nIntro text\n\n## Comments\n').description).toBe('Intro text');
  });

  it('keeps a comment heading that is not a date as comment text', () => {
    const document = parseOk(
      '---\ntitle: T\n---\n\n## Comments\n\n### 2026-11-16 10:00\n\nFirst\n\n### Follow-ups\n\nstill the first comment\n',
    );
    expect(document.comments).toEqual([
      { at: '2026-11-16 10:00', text: 'First\n\n### Follow-ups\n\nstill the first comment' },
    ]);
  });

  it('keeps text before the first comment heading as an undated comment', () => {
    const document = parseOk('---\ntitle: T\n---\n\n## Comments\n\nLoose note\n\n### 2026-11-16 10:00\n\nDated\n');
    expect(document.comments).toEqual([
      { at: '', text: 'Loose note' },
      { at: '2026-11-16 10:00', text: 'Dated' },
    ]);
    const written = serialiseTaskFile(document);
    expect(parseOk(written).comments).toEqual(document.comments);
  });

  it('keeps a history line without a date prefix, with an empty at', () => {
    const document = parseOk(
      '---\ntitle: T\n---\n\n## History\n\n- something happened\n- 2026-11-16 10:00 — Archived\nnot a list line\n',
    );
    expect(document.history).toEqual([
      { at: '', text: 'something happened' },
      { at: '2026-11-16 10:00', text: 'Archived' },
    ]);
    expect(serialiseTaskFile(document)).toContain('- something happened\n- 2026-11-16 10:00 — Archived\n');
  });

  it('reads History before Comments', () => {
    const document = parseOk(
      '---\ntitle: T\n---\n\n## History\n\n- 2026-11-16 10:00 — Archived\n\n## Comments\n\n### 2026-11-16 11:00\n\nHi\n',
    );
    expect(document.history).toHaveLength(1);
    expect(document.comments).toHaveLength(1);
  });
});

describe('toTask', () => {
  it('builds the renderer view with the id and archive flag', () => {
    const task = toTask(parseOk(SPEC_EXAMPLE), 'archive/Why.md', true);
    expect(task).toMatchObject({
      id: 'archive/Why.md',
      isArchived: true,
      archivedAt: null,
      title: 'Why is the staging build failing?',
      order: 2,
    });
    expect(task).not.toHaveProperty('unknownFrontmatter');
    expect(toTask(parseOk(LEGACY_EXAMPLE), 'tasks/Why.md', false)).not.toHaveProperty('responsibility');
  });
});

describe('legacy responsibility', () => {
  function legacy(status: string, responsibility: string, extra = ''): string {
    return `---\ntitle: "Legacy"\nstatus: ${status}\nresponsibility: ${responsibility}\n${extra}created: 2026-11-01T09:00:00\nupdated: 2026-11-02T10:00:00\norder: 3\n---\n\n## Description\n\n## Comments\n\n## History\n\n- 2026-11-01 09:00 — Created in To do\n`;
  }

  it.each([
    ['To do', 'Client', 'With client'],
    ['To do', 'Internal', 'Internal'],
    ['In progress', 'Client', 'With client'],
    ['In progress', 'Internal', 'Internal'],
  ])('reads %s with %s as the %s column', (status, responsibility, expected) => {
    expect(parseOk(legacy(status, responsibility))).toMatchObject({ status: expected, rawStatus: null, order: 3 });
  });

  it.each([
    ['"  in PROGRESS "', 'CLIENT', 'With client'],
    ['to do', '" internal "', 'Internal'],
    ['TO DO', 'client', 'With client'],
  ])('matches the raw spellings %s and %s ignoring case and spaces', (status, responsibility, expected) => {
    expect(parseOk(legacy(status, responsibility))).toMatchObject({ status: expected, rawStatus: null });
  });

  it('leaves Done and the new columns as they are', () => {
    expect(parseOk(legacy('Done', 'Client')).status).toBe('Done');
    expect(parseOk(legacy('done', 'Internal'))).toMatchObject({ status: 'Done', rawStatus: 'done' });
    expect(parseOk(legacy('Internal', 'Client')).status).toBe('Internal');
    expect(parseOk(legacy('With client', 'Internal')).status).toBe('With client');
  });

  it('leaves the status as it is for Me, an unknown or an empty responsibility', () => {
    expect(parseOk(legacy('In progress', 'Me')).status).toBe('In progress');
    expect(parseOk(legacy('in progress', 'Someone'))).toMatchObject({
      status: 'In progress',
      rawStatus: 'in progress',
    });
    expect(parseOk(legacy('To do', '')).status).toBe('To do');
    expect(parseOk(legacy('To do', '[Client]')).status).toBe('To do');
  });

  it('maps only a status that names To do or In progress, not an unknown or missing one', () => {
    expect(parseOk(legacy('Blocked', 'Client'))).toMatchObject({ status: 'To do', rawStatus: 'Blocked' });
    expect(parseOk('---\ntitle: T\nresponsibility: Client\n---\n')).toMatchObject({ status: 'To do', rawStatus: null });
  });

  it('maps an archived file the same way', () => {
    expect(parseOk(legacy('In progress', 'Internal', 'archived: 2026-11-03T08:00:00\n'))).toMatchObject({
      status: 'Internal',
      archivedAt: '2026-11-03T08:00:00',
    });
  });

  it('never keeps the key, so the next write drops it and writes the column, without counting as an update', () => {
    const text = serialiseTaskFile(parseOk(legacy('in progress', 'client')));
    expect(text).not.toContain('responsibility');
    expect(text).toContain('\nstatus: With client\n');
    expect(text).toContain('\nupdated: 2026-11-02T10:00:00\n');
    expect(text.endsWith('## History\n\n- 2026-11-01 09:00 — Created in To do\n')).toBe(true);
    expect(parseOk(legacy('in progress', 'client')).unknownFrontmatter).toEqual([]);
  });

  it('drops a responsibility that does not map, keeping the status spelling', () => {
    const text = serialiseTaskFile(parseOk(legacy('Done', 'Client')));
    expect(text).not.toContain('responsibility');
    expect(text).toContain('\nstatus: Done\n');
    expect(serialiseTaskFile(parseOk(legacy('in progress', 'Me')))).toContain('\nstatus: in progress\n');
  });

  it('fixes a file in the old shape as Obsidian re-serialises it, keeping its unknown keys', () => {
    const obsidianLegacy = `---
updated: "2026-11-16T14:03:12"
created: "2026-11-16T09:30:00"
due: "2026-11-20"
project: "Acme website"
responsibility: client
status: in progress
title: Why is the staging build failing?
tags:
  - work
  - urgent
aliases:
  - staging
order: 2
---

## Description

Body text.

## Comments

## History

- 2026-11-16 09:30 — Created in To do
`;
    const document = parseOk(obsidianLegacy);
    expect(document).toMatchObject({
      status: 'With client',
      rawStatus: null,
      updated: '2026-11-16T14:03:12',
      order: 2,
    });
    expect(document.history).toHaveLength(1);

    const text = serialiseTaskFile(document);
    expect(text).toContain('\nstatus: With client\n');
    expect(text).not.toContain('responsibility');
    expect(text).toContain('\nupdated: 2026-11-16T14:03:12\n');
    expect(text).toContain('order: 2\ntags:\n  - work\n  - urgent\naliases:\n  - staging\n---\n');
    expect(serialiseTaskFile(parseOk(text))).toBe(text);
  });

  it('round-trips the fixed file byte for byte', () => {
    const fixed = serialiseTaskFile(parseOk(LEGACY_EXAMPLE));
    expect(fixed).toBe(
      SPEC_EXAMPLE.replace('Moved from In progress to With client', 'Responsibility changed from Me to Client'),
    );
    expect(serialiseTaskFile(parseOk(fixed))).toBe(fixed);
  });
});
