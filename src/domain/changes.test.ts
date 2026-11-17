import { describe, expect, it } from 'vitest';
import { addComment, applyEdit, archiveDocument, createTaskDocument, moveToColumn, restoreDocument, setOrder } from './changes';
import type { ChangeContext } from './changes';
import type { NewTaskInput, TaskDocument, TaskEdit } from './model';
import { parseTaskFile, serialiseTaskFile } from './taskFile';
import { FALLBACK, makeDocument } from './testHelpers';

const NOW = new Date(2026, 10, 17, 10, 5, 30);
const NOW_FIELD = '2026-11-17T10:05:30';
const NOW_LOG = '2026-11-17 10:05';
const CONTEXT: ChangeContext = { now: NOW, knownProjects: ['Acme website'] };

const INPUT: NewTaskInput = {
  title: '  Fix   login bug ',
  status: 'To do',
  responsibility: 'Client',
  project: 'acme  WEBSITE',
  due: '2026-11-20',
  description: '\nSteps to reproduce.\n\n',
};

function edit(document: TaskDocument, change: TaskEdit, context: ChangeContext = CONTEXT) {
  return applyEdit(document, change, context);
}

function lastHistoryText(document: TaskDocument): string | undefined {
  return document.history[document.history.length - 1]?.text;
}

describe('createTaskDocument', () => {
  it('builds a document with created equal to updated and the single history entry', () => {
    const document = createTaskDocument(INPUT, { ...CONTEXT, order: 4 });
    expect(document).toMatchObject({
      title: 'Fix login bug',
      status: 'To do',
      responsibility: 'Client',
      project: 'Acme website',
      due: '2026-11-20',
      created: NOW_FIELD,
      updated: NOW_FIELD,
      archivedAt: null,
      order: 4,
      description: 'Steps to reproduce.',
      comments: [],
      history: [{ at: NOW_LOG, text: 'Created in To do' }],
    });
  });

  it('names the column it was created in', () => {
    const document = createTaskDocument({ ...INPUT, status: 'In progress' }, { ...CONTEXT, order: 1 });
    expect(document.history[0]?.text).toBe('Created in In progress');
  });

  it('accepts no project and no due date', () => {
    const document = createTaskDocument({ ...INPUT, project: '   ', due: null }, { ...CONTEXT, order: 1 });
    expect(document).toMatchObject({ project: null, due: null });
  });

  it('rejects an empty title', () => {
    expect(() => createTaskDocument({ ...INPUT, title: '   ' }, { ...CONTEXT, order: 1 })).toThrow('A task needs a title.');
  });

  it('rejects an invalid due date', () => {
    expect(() => createTaskDocument({ ...INPUT, due: '2026-02-30' }, { ...CONTEXT, order: 1 })).toThrow(
      'The due date must be a real date, written as YYYY-MM-DD.',
    );
  });

  it('rejects a column or responsibility that does not exist', () => {
    const create = (input: Record<string, unknown>) =>
      createTaskDocument({ ...INPUT, ...input } as NewTaskInput, { ...CONTEXT, order: 1 });
    expect(() => create({ status: 'Blocked' })).toThrow(/column/);
    expect(() => create({ responsibility: 'Nobody' })).toThrow(/responsibility/);
  });

  it('rejects a description that would read back as structure', () => {
    expect(() => createTaskDocument({ ...INPUT, description: 'a\n## History\nb' }, { ...CONTEXT, order: 1 })).toThrow(/description/);
  });

  it('produces a file that parses back to the same document', () => {
    const document = createTaskDocument(INPUT, { ...CONTEXT, order: 4 });
    const parsed = parseTaskFile(serialiseTaskFile(document), FALLBACK);
    expect(parsed).toEqual({ kind: 'ok', document });
  });
});

describe('editing each field', () => {
  const base = makeDocument({ project: 'Acme website', due: '2026-11-20', description: 'Old text' });

  it('title: records the old and new title and bumps updated', () => {
    const result = edit(base, { field: 'title', value: 'New title' });
    expect(result.changed).toBe(true);
    expect(result.document.title).toBe('New title');
    expect(result.document.updated).toBe(NOW_FIELD);
    expect(lastHistoryText(result.document)).toBe('Title changed from "Sample task" to "New title"');
    expect(result.document.history).toHaveLength(base.history.length + 1);
    expect(result.document.history.at(-1)?.at).toBe(NOW_LOG);
  });

  it('title: trims and collapses whitespace, and rejects an empty title', () => {
    expect(edit(base, { field: 'title', value: '  A   B ' }).document.title).toBe('A B');
    expect(() => edit(base, { field: 'title', value: '  ' })).toThrow('A task needs a title.');
  });

  it('description: records "Description edited"', () => {
    const result = edit(base, { field: 'description', value: 'New text' });
    expect(result.document.description).toBe('New text');
    expect(lastHistoryText(result.document)).toBe('Description edited');
  });

  it('project: records the change, using (none) for empty', () => {
    expect(lastHistoryText(edit(makeDocument(), { field: 'project', value: 'Acme website' }).document)).toBe(
      'Project changed from (none) to Acme website',
    );
    expect(lastHistoryText(edit(base, { field: 'project', value: null }).document)).toBe(
      'Project changed from Acme website to (none)',
    );
  });

  it('project: uses the existing spelling of a project ignoring case', () => {
    const result = edit(makeDocument(), { field: 'project', value: '  acme   website ' });
    expect(result.document.project).toBe('Acme website');
  });

  it('responsibility: records the change', () => {
    const result = edit(base, { field: 'responsibility', value: 'Client' });
    expect(result.document.responsibility).toBe('Client');
    expect(lastHistoryText(result.document)).toBe('Responsibility changed from Me to Client');
  });

  it('due: records the change, using (none) for empty', () => {
    expect(lastHistoryText(edit(makeDocument(), { field: 'due', value: '2026-11-20' }).document)).toBe(
      'Due date changed from (none) to 2026-11-20',
    );
    expect(lastHistoryText(edit(base, { field: 'due', value: null }).document)).toBe(
      'Due date changed from 2026-11-20 to (none)',
    );
  });

  it('due: rejects an invalid date', () => {
    expect(() => edit(base, { field: 'due', value: 'tomorrow' })).toThrow('The due date must be a real date, written as YYYY-MM-DD.');
  });

  it('replaces a raw unrecognised responsibility once it is set', () => {
    const raw = makeDocument({ responsibility: 'Me', rawResponsibility: 'someone' });
    const result = edit(raw, { field: 'responsibility', value: 'Internal' });
    expect(result.document).toMatchObject({ responsibility: 'Internal', rawResponsibility: null });
  });
});

describe('no-op edits', () => {
  const base = makeDocument({ project: 'Acme website', due: '2026-11-20', description: 'Text', responsibility: 'Client' });

  it.each<[string, TaskEdit]>([
    ['title', { field: 'title', value: 'Sample task' }],
    ['title with extra spaces', { field: 'title', value: '  Sample   task ' }],
    ['description', { field: 'description', value: 'Text' }],
    ['description with surrounding blank lines', { field: 'description', value: '\n\nText\n\n' }],
    ['project', { field: 'project', value: 'Acme website' }],
    ['project in another case', { field: 'project', value: 'ACME WEBSITE' }],
    ['responsibility', { field: 'responsibility', value: 'Client' }],
    ['due', { field: 'due', value: '2026-11-20' }],
  ])('reports %s unchanged and returns the same document', (_name, change) => {
    const result = edit(base, change);
    expect(result.changed).toBe(false);
    expect(result.document).toBe(base);
  });

  it('treats empty to empty project and due as unchanged', () => {
    const empty = makeDocument();
    expect(edit(empty, { field: 'project', value: '  ' }).changed).toBe(false);
    expect(edit(empty, { field: 'project', value: null }).changed).toBe(false);
    expect(edit(empty, { field: 'due', value: null }).changed).toBe(false);
  });
});

describe('addComment', () => {
  it('appends a trimmed, dated comment and records "Comment added"', () => {
    const document = addComment(makeDocument(), '  Asked the client.  \n', NOW);
    expect(document.comments).toEqual([{ at: NOW_LOG, text: 'Asked the client.' }]);
    expect(document.updated).toBe(NOW_FIELD);
    expect(lastHistoryText(document)).toBe('Comment added');
  });

  it('keeps existing comments, oldest first', () => {
    const first = addComment(makeDocument(), 'One', new Date(2026, 10, 16, 9, 0));
    const second = addComment(first, 'Two', NOW);
    expect(second.comments.map((comment) => comment.text)).toEqual(['One', 'Two']);
  });

  it('rejects an empty comment', () => {
    expect(() => addComment(makeDocument(), '  \n ', NOW)).toThrow("A comment can't be empty.");
  });

  it('rejects a comment containing a line that would split the file', () => {
    expect(() => addComment(makeDocument(), 'ok\n## Comments', NOW)).toThrow(/comment/);
    expect(() => addComment(makeDocument(), 'ok\n### 2026-11-16 10:00', NOW)).toThrow(/comment/);
  });

  it('accepts a heading that is not a date', () => {
    expect(addComment(makeDocument(), '### Notes\nok', NOW).comments).toHaveLength(1);
  });
});

describe('moveToColumn', () => {
  it('records "Moved from X to Y" and sets the order when the column changes', () => {
    const result = moveToColumn(makeDocument({ order: 3 }), 'In progress', 1, NOW);
    expect(result.changed).toBe(true);
    expect(result.document).toMatchObject({ status: 'In progress', order: 1, updated: NOW_FIELD });
    expect(lastHistoryText(result.document)).toBe('Moved from To do to In progress');
  });

  it('is not an update when the column stays the same: only order changes', () => {
    const document = makeDocument({ order: 3 });
    const result = moveToColumn(document, 'To do', 1, NOW);
    expect(result.changed).toBe(true);
    expect(result.document).toEqual({ ...document, order: 1 });
    expect(result.document.history).toBe(document.history);
  });

  it('reports unchanged for the same column and order', () => {
    const document = makeDocument({ order: 3 });
    expect(moveToColumn(document, 'To do', 3, NOW)).toEqual({ changed: false, document });
  });

  it('moving out of Done reopens the task', () => {
    const result = moveToColumn(makeDocument({ status: 'Done' }), 'To do', 1, NOW);
    expect(lastHistoryText(result.document)).toBe('Moved from Done to To do');
  });

  it('replaces a raw unrecognised status when the column changes', () => {
    const result = moveToColumn(makeDocument({ rawStatus: 'Blocked' }), 'Done', 1, NOW);
    expect(result.document.rawStatus).toBeNull();
  });
});

describe('setOrder', () => {
  it('changes only the order and records nothing', () => {
    const document = makeDocument({ order: 1 });
    const result = setOrder(document, 2);
    expect(result.document).toEqual({ ...document, order: 2 });
    expect(result.document.updated).toBe(document.updated);
    expect(setOrder(document, 1).changed).toBe(false);
  });
});

describe('archiveDocument and restoreDocument', () => {
  it('archives a task in Done: sets archived and records "Archived"', () => {
    const document = archiveDocument(makeDocument({ status: 'Done' }), NOW);
    expect(document.archivedAt).toBe(NOW_FIELD);
    expect(document.updated).toBe(NOW_FIELD);
    expect(lastHistoryText(document)).toBe('Archived');
  });

  it('rejects archiving a task that is not in Done', () => {
    expect(() => archiveDocument(makeDocument({ status: 'In progress' }), NOW)).toThrow('Only tasks in Done can be archived.');
  });

  it('restores to Done at the given order, removes archived and records "Restored to Done"', () => {
    const archived = archiveDocument(makeDocument({ status: 'Done', order: 5 }), NOW);
    const later = new Date(2026, 10, 18, 8, 0);
    const restored = restoreDocument(archived, 0, later);
    expect(restored).toMatchObject({ status: 'Done', archivedAt: null, order: 0, updated: '2026-11-18T08:00:00' });
    expect(lastHistoryText(restored)).toBe('Restored to Done');
    expect(serialiseTaskFile(restored)).not.toContain('archived:');
  });
});

describe('unknown frontmatter survives changes', () => {
  it('keeps unknown entries through an edit', () => {
    const document = makeDocument({ unknownFrontmatter: [{ key: 'tags', value: ['a'] }] });
    expect(edit(document, { field: 'title', value: 'Other' }).document.unknownFrontmatter).toBe(document.unknownFrontmatter);
  });
});

describe('ledger data on every update', () => {
  const comment = { at: '2026-11-16 12:00', text: 'Earlier note' };
  const base = makeDocument({
    title: 'Old title',
    project: 'Acme website',
    due: '2026-11-20',
    description: 'Old text\nwith two lines',
    comments: [comment],
  });

  function lastLedger(document: TaskDocument) {
    return document.history.at(-1)?.ledger;
  }

  it('create carries the initial values, with seconds in its time', () => {
    const document = createTaskDocument(INPUT, { ...CONTEXT, order: 1 });
    expect(lastLedger(document)).toEqual({
      v: 1,
      at: NOW_FIELD,
      changes: [
        { field: 'title', from: null, to: 'Fix login bug' },
        { field: 'status', from: null, to: 'To do' },
        { field: 'responsibility', from: null, to: 'Client' },
        { field: 'project', from: null, to: 'Acme website' },
        { field: 'due', from: null, to: '2026-11-20' },
        { field: 'description', from: null, to: 'Steps to reproduce.' },
      ],
    });
  });

  it.each([
    [{ field: 'title', value: 'New title' }, { field: 'title', from: 'Old title', to: 'New title' }],
    [
      { field: 'description', value: 'New text' },
      { field: 'description', from: 'Old text\nwith two lines', to: 'New text' },
    ],
    [{ field: 'project', value: null }, { field: 'project', from: 'Acme website', to: null }],
    [{ field: 'responsibility', value: 'Internal' }, { field: 'responsibility', from: 'Me', to: 'Internal' }],
    [{ field: 'due', value: '2026-12-01' }, { field: 'due', from: '2026-11-20', to: '2026-12-01' }],
  ] as const)('an edit of %o records its old and new value', (change, recorded) => {
    expect(lastLedger(edit(base, change).document)).toEqual({ v: 1, at: NOW_FIELD, changes: [recorded] });
  });

  it('a move records the column', () => {
    expect(lastLedger(moveToColumn(base, 'Done', 1, NOW).document)?.changes).toEqual([
      { field: 'status', from: 'To do', to: 'Done' },
    ]);
  });

  it('a comment records the comment it added', () => {
    expect(lastLedger(addComment(base, '  Called the client ', NOW))?.changes).toEqual([
      { field: 'comments', added: [{ at: NOW_LOG, text: 'Called the client' }], removed: [] },
    ]);
  });

  it('archive and restore record the archived time, and restore the column it returns to', () => {
    const archived = archiveDocument({ ...base, status: 'Done' }, NOW);
    expect(lastLedger(archived)?.changes).toEqual([{ field: 'archived', from: null, to: NOW_FIELD }]);
    const restored = restoreDocument({ ...archived, status: 'In progress' }, 1, NOW);
    expect(lastLedger(restored)?.changes).toEqual([
      { field: 'status', from: 'In progress', to: 'Done' },
      { field: 'archived', from: NOW_FIELD, to: null },
    ]);
  });

  it('records nothing for a no-op edit or a reorder', () => {
    expect(edit(base, { field: 'title', value: 'Old title' }).document.history).toBe(base.history);
    expect(moveToColumn(base, 'To do', 5, NOW).document.history).toBe(base.history);
  });

  it('writes ledger data that reads back from the file', () => {
    const document = addComment(edit(base, { field: 'description', value: 'Plain' }).document, 'Hi', NOW);
    const parsed = parseTaskFile(serialiseTaskFile(document), FALLBACK);
    expect(parsed.kind === 'ok' && parsed.document.history).toEqual(document.history);
  });
});
