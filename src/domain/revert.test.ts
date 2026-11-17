import { describe, expect, it } from 'vitest';
import { addComment, applyEdit, archiveDocument, createTaskDocument, moveToColumn, restoreDocument } from './changes';
import type { HistoryEntry, NewTaskInput, TaskDocument, TaskEdit } from './model';
import { isSameRevertPoint, revertBlocker, revertDocument, revertExpectationFor } from './revert';
import { parseTaskFile, serialiseTaskFile } from './taskFile';
import { FALLBACK } from './testHelpers';

const INPUT: NewTaskInput = {
  title: 'Original title',
  status: 'To do',
  project: 'Acme',
  due: '2026-11-20',
  description: 'First description',
};

let minute = 0;

function nextMoment(): Date {
  minute += 1;
  return new Date(2026, 10, 16, 9, minute, 15);
}

function created(): TaskDocument {
  minute = 0;
  return createTaskDocument(INPUT, {
    now: nextMoment(),
    knownProjects: [],
    order: 1,
  });
}

function edited(document: TaskDocument, edit: TaskEdit): TaskDocument {
  return applyEdit(document, edit, { now: nextMoment(), knownProjects: [] }).document;
}

function commented(document: TaskDocument, text: string): TaskDocument {
  return addComment(document, text, nextMoment());
}

function moved(document: TaskDocument, status: TaskDocument['status']): TaskDocument {
  return moveToColumn(document, status, 1, nextMoment()).document;
}

const REVERT_NOW = new Date(2026, 10, 17, 10, 0, 5);
const LATER = new Date(2026, 10, 18, 9, 0, 0);

function texts(comments: TaskDocument['comments']): string[] {
  return comments.map((comment) => comment.text);
}

function revert(document: TaskDocument, index: number): TaskDocument {
  return revertDocument(document, index, REVERT_NOW);
}

function live(document: TaskDocument) {
  return { ...document, isArchived: false };
}

describe('revertDocument', () => {
  it('gives the state right after entry k, keeps entries 0..k and adds one revert entry', () => {
    const document = edited(edited(created(), { field: 'title', value: 'Second title' }), {
      field: 'title',
      value: 'Third title',
    });
    const result = revert(document, 0);

    expect(result.title).toBe('Original title');
    expect(result.updated).toBe('2026-11-17T10:00:05');
    expect(result.history.slice(0, 1)).toEqual(document.history.slice(0, 1));
    expect(result.history).toHaveLength(2);
    expect(result.history[1]).toEqual({
      at: '2026-11-17 10:00',
      text: 'Reverted to 16 Nov 09:01 — 2 changes discarded',
      ledger: {
        v: 1,
        at: '2026-11-17T10:00:05',
        changes: [{ field: 'title', from: 'Third title', to: 'Original title' }],
      },
    });
  });

  it('reverts every value field, including the full description text', () => {
    let document = created();
    document = edited(document, {
      field: 'description',
      value: 'Second description\nwith --> and ## History',
    });
    document = edited(document, { field: 'project', value: null });
    document = edited(document, { field: 'due', value: '2026-12-24' });
    document = edited(document, { field: 'title', value: 'Renamed' });

    expect(revert(document, 0)).toMatchObject({
      title: 'Original title',
      description: 'First description',
      project: 'Acme',
      due: '2026-11-20',
    });
    expect(revert(document, 1)).toMatchObject({
      title: 'Original title',
      description: 'Second description\nwith --> and ## History',
      project: 'Acme',
    });
  });

  it('moves the task back to the column it was in, dropping a raw column value', () => {
    const document = {
      ...moved(moved(created(), 'In progress'), 'Done'),
      rawStatus: 'done ',
    };
    const result = revert(document, 1);
    expect(result).toMatchObject({ status: 'In progress', rawStatus: null });
    expect(result.history.at(-1)?.ledger?.changes).toEqual([{ field: 'status', from: 'Done', to: 'In progress' }]);
  });

  it('removes comments added after k, and keeps earlier ones and comments added outside the app', () => {
    let document = commented(created(), 'Before');
    document = commented(document, 'After one');
    document = {
      ...document,
      comments: [...document.comments, { at: '2026-11-16 09:50', text: 'Written in Obsidian' }],
    };
    document = commented(document, 'After two');

    const result = revert(document, 1);
    expect(texts(result.comments)).toEqual(['Before', 'Written in Obsidian']);
    expect(result.history.at(-1)?.ledger?.changes).toEqual([
      {
        field: 'comments',
        added: [],
        removed: [
          { at: '2026-11-16 09:03', text: 'After one' },
          { at: '2026-11-16 09:04', text: 'After two' },
        ],
      },
    ]);
  });

  it('skips a comment that was already deleted outside the app', () => {
    const document = commented(commented(created(), 'Keep'), 'Gone');
    const withoutGone = {
      ...document,
      comments: document.comments.filter((comment) => comment.text !== 'Gone'),
    };
    expect(texts(revert(withoutGone, 1).comments)).toEqual(['Keep']);
  });

  it('keeps the current value of a field no later entry touched, so outside edits survive', () => {
    const document = edited(created(), { field: 'title', value: 'Renamed' });
    const editedOutside = {
      ...document,
      project: 'Changed in Obsidian',
      description: 'Edited by an agent',
    };
    expect(revert(editedOutside, 0)).toMatchObject({
      title: 'Original title',
      project: 'Changed in Obsidian',
      description: 'Edited by an agent',
    });
  });

  it('puts back the value from before a later change, even over an outside edit to that field', () => {
    const document = edited(created(), { field: 'project', value: 'Second' });
    expect(revert({ ...document, project: 'Edited outside' }, 0).project).toBe('Acme');
  });

  it('walks back through archive and restore', () => {
    let document = moved(created(), 'Done');
    document = archiveDocument(document, nextMoment());
    document = restoreDocument(document, 1, nextMoment());
    document = edited(document, { field: 'title', value: 'After restore' });

    const result = revert(document, 1);
    expect(result).toMatchObject({
      title: 'Original title',
      status: 'Done',
      archivedAt: null,
    });
    expect(revert(document, 3)).toMatchObject({
      title: 'Original title',
      archivedAt: null,
    });
  });

  it('can revert through a revert entry, bringing back what it removed in date order', () => {
    let document = commented(created(), 'Early');
    document = edited(document, { field: 'title', value: 'Second title' });
    document = commented(document, 'Late');
    const reverted = revert(document, 1);
    expect(reverted.title).toBe('Original title');
    expect(texts(reverted.comments)).toEqual(['Early']);

    const withNewest = commented(reverted, 'Newest');
    const toRevertEntry = revertDocument(withNewest, 2, LATER);
    expect(toRevertEntry.title).toBe('Original title');
    expect(texts(toRevertEntry.comments)).toEqual(['Early']);

    const beforeRevert = revertDocument(withNewest, 1, LATER);
    expect(beforeRevert.title).toBe('Second title');
    expect(texts(beforeRevert.comments)).toEqual(['Early', 'Late']);
    expect(beforeRevert.history.at(-1)?.text).toBe('Reverted to 16 Nov 09:02 — 2 changes discarded');
  });

  it('ignores a change to a field it does not track, but still counts its entry', () => {
    const document = created();
    const unknown: HistoryEntry = {
      at: '2026-11-16 09:30',
      text: 'Priority changed',
      ledger: {
        v: 1,
        at: '2026-11-16T09:30:00',
        changes: [{ field: 'priority', from: 'Low', to: 'High' }],
      },
    };
    const result = revert({ ...document, history: [...document.history, unknown] }, 0);
    expect(result.title).toBe('Original title');
    expect(result.history.at(-1)?.text).toBe('Reverted to 16 Nov 09:01 — 1 change discarded');
  });

  it('adds the year to the revert text when entry k is from another year', () => {
    const document = edited(created(), { field: 'title', value: 'Later' });
    const result = revertDocument(document, 0, new Date(2027, 0, 4, 9, 0, 0));
    expect(result.history.at(-1)?.text).toBe('Reverted to 16 Nov 2026 09:01 — 1 change discarded');
  });

  it('writes a file that reads back to the same document', () => {
    const document = commented(edited(created(), { field: 'description', value: 'New\n\n--> text' }), 'Note');
    const result = revert(document, 0);
    const parsed = parseTaskFile(serialiseTaskFile(result), FALLBACK);
    expect(parsed).toEqual({ kind: 'ok', document: result });
  });

  it('refuses an entry it may not revert to, with a user-presentable message', () => {
    const document = edited(created(), { field: 'title', value: 'Later' });
    expect(() => revert(document, 1)).toThrow("That's the latest entry, so there's nothing to revert.");
    expect(() => revert(document, 5)).toThrow("That history entry doesn't exist.");
  });
});

describe('revertBlocker', () => {
  const base = edited(edited(created(), { field: 'title', value: 'Second' }), {
    field: 'due',
    value: null,
  });

  it('allows any dated entry before the latest when every later entry has ledger data', () => {
    expect(revertBlocker(live(base), 0)).toBeNull();
    expect(revertBlocker(live(base), 1)).toBeNull();
  });

  it('blocks an archived task', () => {
    expect(revertBlocker({ ...base, isArchived: true }, 0)).toBe('archived');
  });

  it('blocks the latest entry', () => {
    expect(revertBlocker(live(base), 2)).toBe('latest');
  });

  it.each([-1, 3, 1.5, Number.NaN])('blocks an index that is not an entry: %s', (index) => {
    expect(revertBlocker(live(base), index)).toBe('noSuchEntry');
  });

  it('blocks entries older than a later entry without ledger data', () => {
    const legacy = { at: '2026-11-16 09:10', text: 'Moved from To do to Done' };
    const history = [base.history[0]!, legacy, ...base.history.slice(1)];
    const document = live({ ...base, history });
    expect(revertBlocker(document, 0)).toBe('beforeLedger');
    expect(revertBlocker(document, 1)).toBeNull();
    expect(revertBlocker(document, 2)).toBeNull();
  });

  it('blocks an undated entry', () => {
    const history = [{ at: '', text: 'Imported' }, ...base.history];
    expect(revertBlocker(live({ ...base, history }), 0)).toBe('undated');
  });

  it('blocks a point where the task was archived', () => {
    let document = moved(created(), 'Done');
    document = archiveDocument(document, nextMoment());
    document = restoreDocument(document, 1, nextMoment());
    document = edited(document, { field: 'title', value: 'Edited' });
    expect(revertBlocker(live(document), 2)).toBe('archivedThen');
    expect(revertBlocker(live(document), 1)).toBeNull();
    expect(revertBlocker(live(document), 3)).toBeNull();
  });
});

describe('revert expectations', () => {
  it('match only the same entry in a history of the same length', () => {
    const document = edited(created(), { field: 'title', value: 'Later' });
    const expected = revertExpectationFor(document.history, 0);
    expect(expected).toEqual({
      historyLength: 2,
      at: '2026-11-16 09:01',
      text: 'Created in To do',
    });
    expect(isSameRevertPoint(document.history, 0, expected)).toBe(true);
    const longer = edited(document, { field: 'title', value: 'Even later' });
    expect(isSameRevertPoint(longer.history, 0, expected)).toBe(false);
    expect(isSameRevertPoint(document.history, 1, expected)).toBe(false);
    expect(isSameRevertPoint(document.history, 7, expected)).toBe(false);
  });
});
