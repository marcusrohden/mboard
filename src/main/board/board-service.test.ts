import { existsSync } from 'node:fs';
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { columnTasks, projectColourIndex, revertExpectationFor } from '../../domain';
import type { BoardSnapshot, NewTaskInput, Task, TaskComment } from '../../shared/contract';
import {
  FakeClock,
  fileState,
  readBoardFile,
  taskFileText,
  waitForSnapshot,
  writeBoardFile,
} from '../test-support/board-test-kit';
import { canWatchFoldersRecursively, inertFolderWatch } from '../test-support/folder-watching';
import { createTemporaryFolder, listFilesRecursively, removeTemporaryFolder } from '../test-support/temporary-folder';
import { AtomicFileWriter } from '../fs/atomic-file-writer';
import { FolderTrash } from '../trash/folder-trash';
import { BoardMessage } from './board-messages';
import { FileBoardService } from './board-service';
import { watchBoardFolder } from './board-watcher';

const NOW = new Date(2026, 10, 16, 9, 30, 0);
const WATCHING_WORKS = await canWatchFoldersRecursively();

const NEW_TASK: NewTaskInput = {
  title: 'Fix login bug',
  status: 'In progress',
  project: 'Acme website',
  due: '2026-11-20',
  description: 'The login fails.',
};

const BROKEN_YAML = '---\ntitle: [unclosed\n---\nBody\n';
const ACME_NOTE = 'projects/Acme website.md';

let root: string;
let boardPath: string;
let trashPath: string;
let clock: FakeClock;
let service: FileBoardService;

function seed(relativePath: string, content: string): Promise<void> {
  return writeBoardFile(boardPath, relativePath, content);
}

function read(relativePath: string): Promise<string> {
  return readBoardFile(boardPath, relativePath);
}

function boardFile(relativePath: string): string {
  return path.join(boardPath, ...relativePath.split('/'));
}

function seedTask(relativePath: string, fields: Record<string, string | number>): Promise<void> {
  return seed(
    relativePath,
    taskFileText({ created: '2026-11-01T09:00:00', updated: '2026-11-01T09:00:00', ...fields }),
  );
}

function taskIn(snapshot: BoardSnapshot, id: string): Task | undefined {
  return snapshot.tasks.find((task) => task.id === id);
}

function columnIds(status: Task['status']): string[] {
  return columnTasks(service.snapshot().tasks, status).map((task) => task.id);
}

async function openBoard(): Promise<void> {
  await service.open(boardPath);
}

beforeEach(async () => {
  root = await createTemporaryFolder('mboard-board-');
  boardPath = path.join(root, 'Vault', 'Board');
  trashPath = path.join(root, 'Trash');
  await mkdir(path.join(boardPath, 'tasks'), { recursive: true });
  await mkdir(path.join(boardPath, 'archive'));
  clock = new FakeClock(NOW);
  service = new FileBoardService({ clock, trash: new FolderTrash(trashPath), watchFolder: inertFolderWatch });
});

afterEach(async () => {
  await service.close();
  await removeTemporaryFolder(root);
  vi.restoreAllMocks();
});

describe('opening a board', () => {
  it('loads live and archived tasks, lists unreadable files and carries the clock', async () => {
    await seedTask('tasks/Alpha.md', { title: '"Alpha"', status: 'To do' });
    await seedTask('archive/Beta.md', { title: '"Beta"', status: 'Done', archived: '2026-11-10T10:00:00' });
    await seed('tasks/Plain note.md', 'Just text\n');
    await seed('tasks/Broken.md', BROKEN_YAML);
    await seed('tasks/.hidden.md', 'hidden');
    await seed('tasks/picture.png', 'not a task');
    await seedTask('tasks/Acme/Grouped.md', { title: '"Grouped"', status: 'To do', project: 'Acme' });
    await seedTask('archive/Acme/Old.md', { title: '"Old"', status: 'Done', project: 'Acme' });
    await seed('tasks/Acme/deeper/Too deep.md', 'too deep');
    await seed('tasks/.drafts/Hidden.md', 'hidden folder');
    await seed('README.md', '# Board');

    await openBoard();
    const snapshot = service.snapshot();

    expect(snapshot.tasks.map((task) => task.id)).toEqual([
      'archive/Acme/Old.md',
      'archive/Beta.md',
      'tasks/Acme/Grouped.md',
      'tasks/Alpha.md',
      'tasks/Plain note.md',
    ]);
    expect(taskIn(snapshot, 'archive/Acme/Old.md')).toMatchObject({ isArchived: true, project: 'Acme' });
    expect(taskIn(snapshot, 'archive/Beta.md')).toMatchObject({ isArchived: true, archivedAt: '2026-11-10T10:00:00' });
    expect(taskIn(snapshot, 'tasks/Plain note.md')).toMatchObject({ title: 'Plain note', description: 'Just text' });
    expect(snapshot.unreadable).toEqual([
      { id: 'tasks/Broken.md', reason: expect.stringContaining("isn't valid YAML") },
    ]);
    expect(snapshot.now).toBe('2026-11-16T09:30:00');
    expect(snapshot.today).toBe('2026-11-16');
  });

  it('reads a board without task folders as empty and never creates the board folder', async () => {
    const missingBoard = path.join(root, 'Missing');
    await service.open(missingBoard);

    expect(service.snapshot().tasks).toEqual([]);
    await expect(service.createTask(NEW_TASK)).rejects.toThrow(BoardMessage.boardFolderMissing);
    expect(existsSync(missingBoard)).toBe(false);
  });

  it('rejects commands and returns an empty snapshot when no board is open', async () => {
    expect(service.snapshot()).toMatchObject({ tasks: [], unreadable: [], today: '2026-11-16' });
    await expect(service.createTask(NEW_TASK)).rejects.toThrow(BoardMessage.noBoardOpen);
    expect(() => service.absolutePath('tasks/Alpha.md')).toThrow(BoardMessage.noBoardOpen);
  });
});

describe('creating a task', () => {
  it('writes the file with every field, at the top of its column', async () => {
    await openBoard();
    const task = await service.createTask(NEW_TASK);

    expect(task).toMatchObject({
      id: 'tasks/Acme website/Fix login bug.md',
      title: 'Fix login bug',
      status: 'In progress',
      created: '2026-11-16T09:30:00',
      updated: '2026-11-16T09:30:00',
      order: 1,
      isArchived: false,
    });
    expect(task.history).toMatchObject([{ at: '2026-11-16 09:30', text: 'Created in In progress' }]);
    expect(await read('tasks/Acme website/Fix login bug.md')).toBe(
      [
        '---',
        'title: "Fix login bug"',
        'status: In progress',
        'project: "[[Acme website]]"',
        'due: 2026-11-20',
        'created: 2026-11-16T09:30:00',
        'updated: 2026-11-16T09:30:00',
        'order: 1',
        '---',
        '',
        '## Description',
        '',
        'The login fails.',
        '',
        '## Comments',
        '',
        '## History',
        '',
        '- 2026-11-16 09:30 — Created in In progress <!-- mboard-ledger {"v":1,"at":"2026-11-16T09:30:00","changes":[' +
          '{"field":"title","from":null,"to":"Fix login bug"},{"field":"status","from":null,"to":"In progress"},' +
          '{"field":"project","from":null,"to":"Acme website"},' +
          '{"field":"due","from":null,"to":"2026-11-20"},{"field":"description","from":null,"to":"The login fails."}]} -->',
        '',
      ].join('\n'),
    );

    const second = await service.createTask({ ...NEW_TASK, title: 'Second' });
    expect(second.order).toBe(0);
    expect(columnIds('In progress')).toEqual(['tasks/Acme website/Second.md', 'tasks/Acme website/Fix login bug.md']);
  });

  it('numbers a clashing file name, ignoring case, even for concurrent creates', async () => {
    await seed('tasks/Acme website/fix LOGIN bug.md', 'An outside note\n');
    await openBoard();
    const created = await Promise.all([service.createTask(NEW_TASK), service.createTask(NEW_TASK)]);

    expect(created.map((task) => task.id).sort()).toEqual([
      'tasks/Acme website/Fix login bug 2.md',
      'tasks/Acme website/Fix login bug 3.md',
    ]);
  });

  it('uses the existing spelling of a project, including projects of archived tasks', async () => {
    await seedTask('archive/Old.md', { title: 'Old', status: 'Done', project: 'Acme Website' });
    await openBoard();
    const task = await service.createTask({ ...NEW_TASK, project: '  acme   WEBSITE ' });

    expect(task.project).toBe('Acme Website');
  });

  it('creates the tasks folder on demand', async () => {
    await rm(path.join(boardPath, 'tasks'), { recursive: true });
    await openBoard();
    await service.createTask(NEW_TASK);

    expect(await listFilesRecursively(boardPath)).toEqual([ACME_NOTE, 'tasks/Acme website/Fix login bug.md']);
  });

  it('rejects invalid input without writing anything', async () => {
    await openBoard();
    await expect(service.createTask({ ...NEW_TASK, title: '   ' })).rejects.toThrow('A task needs a title.');
    await expect(service.createTask({ ...NEW_TASK, due: '2026-02-30' })).rejects.toThrow('real date');
    expect(await listFilesRecursively(boardPath)).toEqual([]);
  });
});

describe('editing a task', () => {
  beforeEach(async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    clock.advanceMinutes(90);
  });

  it.each([
    [{ field: 'description', value: 'New details.' }, 'Description edited'],
    [{ field: 'project', value: null }, 'Project changed from Acme website to (none)'],
    [{ field: 'due', value: '2026-12-01' }, 'Due date changed from 2026-11-20 to 2026-12-01'],
  ] as const)('applies %o, bumps updated and adds one history entry', async (edit, historyText) => {
    const task = await service.editTask('tasks/Acme website/Fix login bug.md', edit);

    expect(task.updated).toBe('2026-11-16T11:00:00');
    expect(task.history).toHaveLength(2);
    expect(task.history[1]).toMatchObject({
      at: '2026-11-16 11:00',
      text: historyText,
      ledger: { at: '2026-11-16T11:00:00' },
    });
    expect(await read(task.id)).toContain(`- 2026-11-16 11:00 — ${historyText} <!-- mboard-ledger {`);
  });

  it('renames the file when the title changes', async () => {
    const task = await service.editTask('tasks/Acme website/Fix login bug.md', {
      field: 'title',
      value: 'Fix: sign-in bug?',
    });

    expect(task.id).toBe('tasks/Acme website/Fix sign-in bug.md');
    expect(task.history.at(-1)?.text).toBe('Title changed from "Fix login bug" to "Fix: sign-in bug?"');
    expect(await listFilesRecursively(boardPath)).toEqual([ACME_NOTE, 'tasks/Acme website/Fix sign-in bug.md']);
    expect(await read('tasks/Acme website/Fix sign-in bug.md')).toContain('title: "Fix: sign-in bug?"');
    expect(service.snapshot().tasks.map((snapshotTask) => snapshotTask.id)).toEqual([
      'tasks/Acme website/Fix sign-in bug.md',
    ]);
  });

  it('renames the file for a change of case only', async () => {
    const task = await service.editTask('tasks/Acme website/Fix login bug.md', {
      field: 'title',
      value: 'Fix Login Bug',
    });

    expect(task.id).toBe('tasks/Acme website/Fix Login Bug.md');
    expect(await listFilesRecursively(boardPath)).toEqual([ACME_NOTE, 'tasks/Acme website/Fix Login Bug.md']);
  });

  it('numbers the new name when another file already has it', async () => {
    await seed('tasks/Acme website/Other.md', 'Someone else\n');
    const task = await service.editTask('tasks/Acme website/Fix login bug.md', { field: 'title', value: 'other' });

    expect(task.id).toBe('tasks/Acme website/other 2.md');
  });

  it('writes nothing for an unchanged value', async () => {
    const before = await fileState(boardFile('tasks/Acme website/Fix login bug.md'));
    const task = await service.editTask('tasks/Acme website/Fix login bug.md', {
      field: 'project',
      value: ' acme WEBSITE ',
    });

    expect(task.history).toHaveLength(1);
    expect(await fileState(boardFile('tasks/Acme website/Fix login bug.md'))).toEqual(before);
  });

  it('rereads the file, so an outside edit is never overwritten with a stale copy', async () => {
    const original = await read('tasks/Acme website/Fix login bug.md');
    await writeFile(
      boardFile('tasks/Acme website/Fix login bug.md'),
      original.replace('The login fails.', 'Edited in Obsidian.'),
    );

    await service.editTask('tasks/Acme website/Fix login bug.md', { field: 'due', value: '2026-12-01' });

    expect(await read('tasks/Acme website/Fix login bug.md')).toContain('Edited in Obsidian.');
  });

  it('keeps unknown frontmatter keys, in their original order, through an edit', async () => {
    await seed(
      'tasks/Reserialised.md',
      [
        '---',
        'tags:',
        '  - work',
        'status: "in progress"',
        "title: 'Reserialised'",
        'aliases: [one, two]',
        'created: 2026-11-10 08:00',
        'updated: 2026-11-10T08:00:00+11:00',
        'cssclasses: wide',
        '---',
        'Body text',
        '',
      ].join('\n'),
    );
    await service.rescan();
    const edited = await service.editTask('tasks/Reserialised.md', { field: 'project', value: 'Acme' });

    expect(edited.id).toBe('tasks/Acme/Reserialised.md');
    const text = await read('tasks/Acme/Reserialised.md');
    const keys = text
      .split('---')[1]
      ?.split('\n')
      .filter((line) => /^[a-z]+:/.test(line))
      .map((line) => line.split(':')[0]);
    expect(keys).toEqual(['title', 'status', 'project', 'created', 'updated', 'tags', 'aliases', 'cssclasses']);
    expect(text).toContain('status: in progress\n');
    expect(text).toContain('tags:\n  - work\n');
    expect(text).toContain('aliases:\n  - one\n  - two\n');
    expect(text).toContain('## Description\n\nBody text\n');
  });
});

describe('commenting', () => {
  it('appends a dated comment and records it in the history', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    clock.advanceMinutes(5);
    const task = await service.addComment('tasks/Acme website/Fix login bug.md', '  Asked for the credentials.  ');

    expect(task.comments).toEqual([{ at: '2026-11-16 09:35', text: 'Asked for the credentials.' }]);
    expect(task.history.at(-1)).toEqual({
      at: '2026-11-16 09:35',
      text: 'Comment added',
      ledger: {
        v: 1,
        at: '2026-11-16T09:35:00',
        changes: [
          { field: 'comments', added: [{ at: '2026-11-16 09:35', text: 'Asked for the credentials.' }], removed: [] },
        ],
      },
    });
    expect(await read('tasks/Acme website/Fix login bug.md')).toContain(
      '## Comments\n\n### 2026-11-16 09:35\n\nAsked for the credentials.\n\n## History',
    );
  });

  it('rejects an empty comment', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    await expect(service.addComment('tasks/Acme website/Fix login bug.md', '   ')).rejects.toThrow(
      "A comment can't be empty.",
    );
  });
});

describe('changing a comment date', () => {
  const id = 'tasks/Acme website/Fix login bug.md';

  async function taskWithTwoComments(): Promise<Task> {
    await openBoard();
    await service.createTask(NEW_TASK);
    clock.advanceMinutes(30);
    await service.addComment(id, 'Asked for the credentials.');
    clock.advanceMinutes(60);
    const task = await service.addComment(id, 'Got them.');
    clock.advanceMinutes(60);
    return task;
  }

  it("writes the new date and moves date updated to it when it is the task's latest comment", async () => {
    const before = await taskWithTwoComments();
    const latest = before.comments[1] as TaskComment;

    const task = await service.changeCommentDate(id, latest, '2026-11-16T10:15');

    expect(task.comments.map((comment) => comment.at)).toEqual(['2026-11-16 10:00', '2026-11-16 10:15']);
    expect(task.updated).toBe('2026-11-16T10:15:00');
    expect(task.history.at(-1)?.text).toBe('Comment date changed from 2026-11-16 11:00 to 2026-11-16 10:15');
    expect(task.history.at(-1)?.at).toBe('2026-11-16 12:00');
    expect(await read(id)).toContain('### 2026-11-16 10:15\n\nGot them.\n');
    expect(service.snapshot().tasks.find((candidate) => candidate.id === id)?.updated).toBe('2026-11-16T10:15:00');
  });

  it('leaves date updated as it was when the comment is not the latest', async () => {
    const before = await taskWithTwoComments();

    const task = await service.changeCommentDate(id, before.comments[0] as TaskComment, '2026-11-16 09:45');

    expect(task.comments[0]).toEqual({ at: '2026-11-16 09:45', text: 'Asked for the credentials.' });
    expect(task.updated).toBe(before.updated);
  });

  it('refuses a date in the future and writes nothing', async () => {
    const before = await taskWithTwoComments();
    const file = await read(id);

    await expect(service.changeCommentDate(id, before.comments[1] as TaskComment, '2026-11-16 12:01')).rejects.toThrow(
      "A comment can't be dated in the future.",
    );
    expect(await read(id)).toBe(file);
  });
});

describe('moving and reordering', () => {
  beforeEach(async () => {
    await seedTask('tasks/A.md', { title: 'A', status: 'To do', order: 1 });
    await seedTask('tasks/B.md', { title: 'B', status: 'To do', order: 2 });
    await seedTask('tasks/C.md', { title: 'C', status: 'To do', order: 3 });
    await seedTask('tasks/D.md', { title: 'D', status: 'Done', order: 1 });
    await openBoard();
    clock.advanceMinutes(30);
  });

  it('moves a task to another column where it was dropped and records the move', async () => {
    const task = await service.moveTask('tasks/B.md', 'Done', 'tasks/D.md');

    expect(task).toMatchObject({ status: 'Done', order: 0, updated: '2026-11-16T10:00:00' });
    expect(task.history).toEqual([
      {
        at: '2026-11-16 10:00',
        text: 'Moved from To do to Done',
        ledger: { v: 1, at: '2026-11-16T10:00:00', changes: [{ field: 'status', from: 'To do', to: 'Done' }] },
      },
    ]);
    expect(columnIds('Done')).toEqual(['tasks/B.md', 'tasks/D.md']);
    expect(columnIds('To do')).toEqual(['tasks/A.md', 'tasks/C.md']);
  });

  it('writes a comment that comes with a move in the same update, and the file reads back with it', async () => {
    const task = await service.moveTask('tasks/B.md', 'Done', null, ' Shipped to production ');

    expect(task.comments).toEqual([{ at: '2026-11-16 10:00', text: 'Shipped to production' }]);
    expect(task.history.map((entry) => entry.text)).toEqual(['Moved from To do to Done']);
    expect(task.history[0]?.ledger?.changes).toEqual([
      { field: 'status', from: 'To do', to: 'Done' },
      { field: 'comments', added: [{ at: '2026-11-16 10:00', text: 'Shipped to production' }], removed: [] },
    ]);
    expect(await read('tasks/B.md')).toContain('### 2026-11-16 10:00\n\nShipped to production\n');
    expect(taskIn(service.snapshot(), 'tasks/B.md')?.comments).toEqual(task.comments);
  });

  it('moves a task to the end of a column when there is no task below it', async () => {
    const task = await service.moveTask('tasks/A.md', 'Done', null);

    expect(task.order).toBe(2);
    expect(columnIds('Done')).toEqual(['tasks/D.md', 'tasks/A.md']);
  });

  it('reorders within a column by changing only the order of the moved file', async () => {
    const before = taskIn(service.snapshot(), 'tasks/C.md');
    const untouched = await Promise.all(['tasks/A.md', 'tasks/B.md'].map((id) => fileState(boardFile(id))));
    const task = await service.moveTask('tasks/C.md', 'To do', 'tasks/A.md');

    expect(task).toEqual({ ...before, order: 0 });
    expect(taskIn(service.snapshot(), 'tasks/C.md')).toEqual(task);
    expect(await Promise.all(['tasks/A.md', 'tasks/B.md'].map((id) => fileState(boardFile(id))))).toEqual(untouched);
    expect(columnIds('To do')).toEqual(['tasks/C.md', 'tasks/A.md', 'tasks/B.md']);
  });

  it('renumbers the column when there is no room between the neighbours, without counting it as an update', async () => {
    await seedTask('tasks/B.md', { title: 'B', status: 'To do', order: 1.0000001 });
    await service.rescan();
    const untouchedA = await fileState(boardFile('tasks/A.md'));
    const task = await service.moveTask('tasks/C.md', 'To do', 'tasks/B.md');

    expect(task.order).toBe(2);
    expect(columnIds('To do')).toEqual(['tasks/A.md', 'tasks/C.md', 'tasks/B.md']);
    expect(await fileState(boardFile('tasks/A.md'))).toEqual(untouchedA);
    const renumbered = await read('tasks/B.md');
    expect(renumbered).toContain('order: 3\n');
    expect(renumbered).toContain('updated: 2026-11-01T09:00:00\n');
    expect(renumbered).toContain('## History\n');
    expect(renumbered).not.toContain('## History\n\n-');
  });

  it('moves a task freely between every column, recording each move', async () => {
    for (const status of ['Internal', 'With client', 'In progress', 'With client', 'Done', 'Internal'] as const) {
      await service.moveTask('tasks/A.md', status, null);
    }

    expect(taskIn(service.snapshot(), 'tasks/A.md')?.history.map((entry) => entry.text)).toEqual([
      'Moved from To do to Internal',
      'Moved from Internal to With client',
      'Moved from With client to In progress',
      'Moved from In progress to With client',
      'Moved from With client to Done',
      'Moved from Done to Internal',
    ]);
    expect(columnIds('Internal')).toEqual(['tasks/A.md']);
    expect(await read('tasks/A.md')).toContain('\nstatus: Internal\n');
  });

  it('rejects a neighbour that is the task itself or not in the target column', async () => {
    await expect(service.moveTask('tasks/A.md', 'To do', 'tasks/A.md')).rejects.toThrow(
      BoardMessage.placedBeforeItself,
    );
    await expect(service.moveTask('tasks/A.md', 'Done', 'tasks/B.md')).rejects.toThrow("isn't in the column");
  });
});

describe('archiving and restoring', () => {
  beforeEach(async () => {
    await seedTask('tasks/Shipped.md', { title: 'Shipped', status: 'Done', order: 1 });
    await seedTask('tasks/Released.md', { title: 'Released', status: 'Done', order: 2 });
    await seedTask('tasks/Working.md', { title: 'Working', status: 'In progress' });
    await openBoard();
    clock.advanceMinutes(60);
  });

  it('archives a task in Done by moving it to archive/ and recording it', async () => {
    const task = await service.archiveTask('tasks/Shipped.md');

    expect(task).toMatchObject({ id: 'archive/Shipped.md', isArchived: true, archivedAt: '2026-11-16T10:30:00' });
    expect(task.history.at(-1)?.text).toBe('Archived');
    expect(await read('archive/Shipped.md')).toContain('archived: 2026-11-16T10:30:00\n');
    expect(existsSync(boardFile('tasks/Shipped.md'))).toBe(false);
  });

  it('refuses to archive a task that is not in Done', async () => {
    await expect(service.archiveTask('tasks/Working.md')).rejects.toThrow('Only tasks in Done can be archived.');
    expect(existsSync(boardFile('tasks/Working.md'))).toBe(true);
  });

  it('numbers the archived file when archive/ already has that name', async () => {
    await seedTask('archive/shipped.md', { title: 'Shipped long ago', status: 'Done' });
    const task = await service.archiveTask('tasks/Shipped.md');

    expect(task.id).toBe('archive/Shipped 2.md');
  });

  it('archives every task in Done with Archive all', async () => {
    expect(await service.archiveAllDone()).toBe(2);
    expect(await listFilesRecursively(boardPath)).toEqual([
      'archive/Released.md',
      'archive/Shipped.md',
      'tasks/Working.md',
    ]);
  });

  it('archives only Done with Archive all, leaving Internal and With client alone', async () => {
    await seedTask('tasks/Team.md', { title: 'Team', status: 'Internal' });
    await seedTask('tasks/Client.md', { title: 'Client', status: 'With client' });
    await service.rescan();

    await expect(service.archiveTask('tasks/Client.md')).rejects.toThrow('Only tasks in Done can be archived.');
    expect(await service.archiveAllDone()).toBe(2);
    expect(await listFilesRecursively(path.join(boardPath, 'tasks'))).toEqual(['Client.md', 'Team.md', 'Working.md']);
  });

  it('restores an archived task to the top of Done', async () => {
    await service.archiveTask('tasks/Shipped.md');
    clock.advanceMinutes(10);
    const task = await service.restoreTask('archive/Shipped.md');

    expect(task).toMatchObject({
      id: 'tasks/Shipped.md',
      status: 'Done',
      isArchived: false,
      archivedAt: null,
      order: 1,
    });
    expect(task.history.slice(-2).map((entry) => entry.text)).toEqual(['Archived', 'Restored to Done']);
    expect(await read('tasks/Shipped.md')).not.toContain('archived:');
    expect(columnIds('Done')).toEqual(['tasks/Shipped.md', 'tasks/Released.md']);
  });

  it("changes an archived task's project, moving its file within archive/ and keeping its age", async () => {
    await service.archiveTask('tasks/Shipped.md');
    const archived = taskIn(service.snapshot(), 'archive/Shipped.md');

    const task = await service.editTask('archive/Shipped.md', { field: 'project', value: 'Globex' });

    expect(task).toMatchObject({ id: 'archive/Globex/Shipped.md', project: 'Globex', isArchived: true });
    expect(task.updated).toBe(archived?.updated);
    expect(task.history.at(-1)?.text).toBe('Project changed from (none) to Globex');
    expect(await read('archive/Globex/Shipped.md')).toContain('project: "[[Globex]]"\n');
    expect(existsSync(boardFile('projects/Globex.md'))).toBe(true);
  });

  it('keeps archived tasks read-only apart from their project, restore and delete', async () => {
    await service.archiveTask('tasks/Shipped.md');
    const archived = await fileState(boardFile('archive/Shipped.md'));

    await expect(service.editTask('archive/Shipped.md', { field: 'title', value: 'New' })).rejects.toThrow(
      BoardMessage.archivedReadOnly,
    );
    await expect(service.addComment('archive/Shipped.md', 'Hello')).rejects.toThrow(BoardMessage.archivedReadOnly);
    await expect(
      service.changeCommentDate('archive/Shipped.md', { at: '', text: 'Hello' }, '2026-11-16 09:00'),
    ).rejects.toThrow(BoardMessage.archivedReadOnly);
    await expect(service.moveTask('archive/Shipped.md', 'To do', null)).rejects.toThrow(BoardMessage.archivedReadOnly);
    await expect(service.archiveTask('archive/Shipped.md')).rejects.toThrow(BoardMessage.alreadyArchived);
    await expect(service.restoreTask('tasks/Working.md')).rejects.toThrow(BoardMessage.notArchived);
    expect(await fileState(boardFile('archive/Shipped.md'))).toEqual(archived);

    await service.deleteTask('archive/Shipped.md');
    expect(await listFilesRecursively(trashPath)).toEqual(['Shipped.md']);
  });
});

describe('reverting', () => {
  beforeEach(async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    clock.advanceMinutes(10);
  });

  function expectationAt(id: string, index: number) {
    const task = taskIn(service.snapshot(), id);
    if (task === undefined) throw new Error(`No task ${id}.`);
    return revertExpectationFor(task.history, index);
  }

  it('renames the file back, keeps an outside edit to a field no later change touched, and records the revert', async () => {
    await service.editTask('tasks/Acme website/Fix login bug.md', { field: 'title', value: 'Fix sign in' });
    clock.advanceMinutes(5);
    await service.editTask('tasks/Acme website/Fix sign in.md', { field: 'due', value: '2026-12-01' });
    const editedOutside = (await read('tasks/Acme website/Fix sign in.md')).replace(
      'project: "[[Acme website]]"',
      'project: Edited in Obsidian',
    );
    await writeBoardFile(boardPath, 'tasks/Acme website/Fix sign in.md', editedOutside);
    await service.rescan();
    const expected = expectationAt('tasks/Acme website/Fix sign in.md', 0);
    clock.advanceMinutes(5);

    const task = await service.revertTask('tasks/Acme website/Fix sign in.md', 0, expected);

    expect(task).toMatchObject({
      id: 'tasks/Edited in Obsidian/Fix login bug.md',
      title: 'Fix login bug',
      due: '2026-11-20',
      project: 'Edited in Obsidian',
      updated: '2026-11-16T09:50:00',
    });
    expect(task.history.map((entry) => entry.text)).toEqual([
      'Created in In progress',
      'Reverted to 16 Nov 09:30 — 2 changes discarded',
    ]);
    expect(await listFilesRecursively(boardPath)).toEqual([
      ACME_NOTE,
      'projects/Edited in Obsidian.md',
      'tasks/Edited in Obsidian/Fix login bug.md',
    ]);
    const content = await read('tasks/Edited in Obsidian/Fix login bug.md');
    expect(content).toContain(
      '- 2026-11-16 09:50 — Reverted to 16 Nov 09:30 — 2 changes discarded <!-- mboard-ledger {',
    );
    expect(content).toContain('"changes":[{"field":"title","from":"Fix sign in","to":"Fix login bug"},');
    expect(taskIn(service.snapshot(), 'tasks/Edited in Obsidian/Fix login bug.md')?.title).toBe('Fix login bug');
  });

  it('puts a task whose column changes back at the top of that column, and removes later comments', async () => {
    await service.createTask({ ...NEW_TASK, title: 'Neighbour' });
    await service.addComment('tasks/Acme website/Fix login bug.md', 'Waiting on the client');
    await service.moveTask('tasks/Acme website/Fix login bug.md', 'Done', null);
    const expected = expectationAt('tasks/Acme website/Fix login bug.md', 0);

    const task = await service.revertTask('tasks/Acme website/Fix login bug.md', 0, expected);

    expect(task).toMatchObject({ status: 'In progress', comments: [] });
    expect(columnIds('In progress')).toEqual([
      'tasks/Acme website/Fix login bug.md',
      'tasks/Acme website/Neighbour.md',
    ]);
    expect(await read('tasks/Acme website/Fix login bug.md')).not.toContain('### 2026-11-16');
  });

  it('rejects a stale view of the history without writing anything', async () => {
    await service.editTask('tasks/Acme website/Fix login bug.md', { field: 'title', value: 'Fix sign in' });
    const renamed = 'tasks/Acme website/Fix sign in.md';
    const expected = expectationAt(renamed, 0);
    await service.editTask(renamed, { field: 'due', value: null });
    const before = await fileState(boardFile(renamed));

    await expect(service.revertTask(renamed, 0, expected)).rejects.toThrow(BoardMessage.staleRevert);
    await expect(service.revertTask(renamed, 1, { ...expected, historyLength: 3 })).rejects.toThrow(
      BoardMessage.staleRevert,
    );
    expect(await fileState(boardFile(renamed))).toEqual(before);
  });

  it('refuses an entry it may not revert to, and an archived task', async () => {
    await service.moveTask('tasks/Acme website/Fix login bug.md', 'Done', null);
    const latest = expectationAt('tasks/Acme website/Fix login bug.md', 1);
    await expect(service.revertTask('tasks/Acme website/Fix login bug.md', 1, latest)).rejects.toThrow(
      "That's the latest entry, so there's nothing to revert.",
    );
    await service.archiveTask('tasks/Acme website/Fix login bug.md');
    const archived = expectationAt('archive/Acme website/Fix login bug.md', 0);
    await expect(service.revertTask('archive/Acme website/Fix login bug.md', 0, archived)).rejects.toThrow(
      BoardMessage.archivedReadOnly,
    );
  });
});

describe('deleting', () => {
  it('moves the file into the trash folder', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    await service.deleteTask('tasks/Acme website/Fix login bug.md');

    expect(await listFilesRecursively(boardPath)).toEqual([ACME_NOTE]);
    expect(await listFilesRecursively(trashPath)).toEqual(['Fix login bug.md']);
    expect(service.snapshot().tasks).toEqual([]);
  });

  it('rejects a task whose file is already gone', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    await unlink(boardFile('tasks/Acme website/Fix login bug.md'));

    await expect(service.deleteTask('tasks/Acme website/Fix login bug.md')).rejects.toThrow(BoardMessage.taskMissing);
  });
});

describe('outside edits', () => {
  it.skipIf(!WATCHING_WORKS)(
    'picks up files added, edited and deleted outside the app, without writing anything',
    async () => {
      const watchingService = new FileBoardService({
        clock,
        trash: new FolderTrash(trashPath),
        watchFolder: (folder, onChange) => watchBoardFolder(folder, onChange, 50),
      });
      try {
        await watchingService.open(boardPath);
        const added = taskFileText({ title: '"From Obsidian"', status: 'In progress' }, '\nWritten elsewhere.\n');
        const appeared = waitForSnapshot(
          watchingService,
          (snapshot) => taskIn(snapshot, 'tasks/From Obsidian.md') !== undefined,
        );
        await seed('tasks/From Obsidian.md', added);
        expect(taskIn(await appeared, 'tasks/From Obsidian.md')?.status).toBe('In progress');

        const edited = added.replace('In progress', 'Done');
        const changed = waitForSnapshot(
          watchingService,
          (snapshot) => taskIn(snapshot, 'tasks/From Obsidian.md')?.status === 'Done',
        );
        await writeFile(boardFile('tasks/From Obsidian.md'), edited);
        await changed;
        expect(await read('tasks/From Obsidian.md')).toBe(edited);
        expect(await listFilesRecursively(boardPath)).toEqual(['tasks/From Obsidian.md']);

        const removed = waitForSnapshot(watchingService, (snapshot) => snapshot.tasks.length === 0);
        await unlink(boardFile('tasks/From Obsidian.md'));
        await removed;
      } finally {
        await watchingService.close();
      }
    },
  );

  it('tells listeners about every scan and every command that wrote, but not about a no-op edit', async () => {
    await openBoard();
    const snapshots: BoardSnapshot[] = [];
    service.onChange((snapshot) => snapshots.push(snapshot));

    await service.rescan();
    await service.createTask(NEW_TASK);
    await service.editTask('tasks/Acme website/Fix login bug.md', { field: 'title', value: 'Fix login bug' });

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.tasks.map((task) => task.id)).toEqual(['tasks/Acme website/Fix login bug.md']);
  });
});

describe('legacy files with a responsibility', () => {
  function seedLegacy(
    relativePath: string,
    status: string,
    responsibility: string,
    fields: Record<string, string | number> = {},
  ): Promise<void> {
    const title = relativePath.replace(/^(tasks|archive)\/|\.md$/g, '');
    return seedTask(relativePath, { title, status, responsibility, ...fields });
  }

  it('shows each in the column its responsibility now names, without writing anything', async () => {
    await seedLegacy('tasks/Waiting on client.md', 'In progress', 'Client', { order: 2 });
    await seedLegacy('tasks/Waiting on team.md', 'to do', 'internal', { order: 1 });
    await seedLegacy('tasks/Mine.md', 'In progress', 'Me', { order: 1 });
    await seedLegacy('tasks/Finished.md', 'Done', 'Client', { order: 1 });
    await seedLegacy('archive/Old.md', 'In progress', 'Client', { archived: '2026-11-05T09:00:00' });
    const ids = [
      'tasks/Waiting on client.md',
      'tasks/Waiting on team.md',
      'tasks/Mine.md',
      'tasks/Finished.md',
      'archive/Old.md',
    ];
    const before = await Promise.all(ids.map((id) => fileState(boardFile(id))));

    await openBoard();
    await service.rescan();

    expect(columnIds('With client')).toEqual(['tasks/Waiting on client.md']);
    expect(columnIds('Internal')).toEqual(['tasks/Waiting on team.md']);
    expect(columnIds('In progress')).toEqual(['tasks/Mine.md']);
    expect(columnIds('Done')).toEqual(['tasks/Finished.md']);
    expect(taskIn(service.snapshot(), 'archive/Old.md')).toMatchObject({ status: 'With client', isArchived: true });
    const mapped = taskIn(service.snapshot(), 'tasks/Waiting on client.md');
    expect(mapped).toMatchObject({ order: 2, updated: '2026-11-01T09:00:00', history: [] });
    expect(mapped).not.toHaveProperty('responsibility');
    expect(await Promise.all(ids.map((id) => fileState(boardFile(id))))).toEqual(before);
  });

  it('fixes a file on its next edit, recording only the edit', async () => {
    await seedLegacy('tasks/Quote.md', 'In progress', 'Client');
    await openBoard();
    clock.advanceMinutes(30);

    const task = await service.editTask('tasks/Quote.md', { field: 'description', value: 'Sent the quote.' });

    expect(task).toMatchObject({ status: 'With client', updated: '2026-11-16T10:00:00' });
    expect(task.history).toMatchObject([{ at: '2026-11-16 10:00', text: 'Description edited' }]);
    const text = await read('tasks/Quote.md');
    expect(text).toContain('\nstatus: With client\n');
    expect(text).not.toContain('responsibility');
  });

  it('fixes a file on a reorder, which is still not an update', async () => {
    await seedLegacy('tasks/Quote.md', 'In progress', 'Client', { order: 1 });
    await seedTask('tasks/Newer.md', { title: 'Newer', status: 'With client', order: 2 });
    await openBoard();
    clock.advanceMinutes(30);

    const task = await service.moveTask('tasks/Quote.md', 'With client', null);

    expect(task).toMatchObject({ status: 'With client', order: 3, updated: '2026-11-01T09:00:00', history: [] });
    const text = await read('tasks/Quote.md');
    expect(text).toContain('\nstatus: With client\n');
    expect(text).not.toContain('responsibility');
    expect(text).toContain('\nupdated: 2026-11-01T09:00:00\n');
    expect(text).not.toContain('## History\n\n-');
    expect(columnIds('With client')).toEqual(['tasks/Newer.md', 'tasks/Quote.md']);
  });

  it('renumbers a column merged from two legacy columns when a drop lands between equal orders', async () => {
    await seedLegacy('tasks/Quote.md', 'To do', 'Client', { order: 1 });
    await seedLegacy('tasks/Access.md', 'In progress', 'Client', { order: 1, created: '2026-11-03T09:00:00' });
    await seedTask('tasks/Mover.md', { title: 'Mover', status: 'To do', order: 1 });
    await openBoard();
    const untouchedAccess = await fileState(boardFile('tasks/Access.md'));
    expect(columnIds('With client')).toEqual(['tasks/Access.md', 'tasks/Quote.md']);
    clock.advanceMinutes(30);

    const task = await service.moveTask('tasks/Mover.md', 'With client', 'tasks/Quote.md');

    expect(task).toMatchObject({ status: 'With client', order: 2 });
    expect(task.history).toMatchObject([{ at: '2026-11-16 10:00', text: 'Moved from To do to With client' }]);
    expect(columnIds('With client')).toEqual(['tasks/Access.md', 'tasks/Mover.md', 'tasks/Quote.md']);
    expect(await fileState(boardFile('tasks/Access.md'))).toEqual(untouchedAccess);
    const renumbered = await read('tasks/Quote.md');
    expect(renumbered).toContain('\norder: 3\n');
    expect(renumbered).toContain('\nstatus: With client\n');
    expect(renumbered).not.toContain('responsibility');
    expect(renumbered).toContain('\nupdated: 2026-11-01T09:00:00\n');
  });

  it('puts a task moved by a button at the top of a merged column with a single write', async () => {
    await seedLegacy('tasks/Team A.md', 'To do', 'Internal', { order: 1 });
    await seedLegacy('tasks/Team B.md', 'In progress', 'Internal', { order: 1, created: '2026-11-03T09:00:00' });
    await seedTask('tasks/Mover.md', { title: 'Mover', status: 'To do', order: 1 });
    await openBoard();
    const neighbours = ['tasks/Team A.md', 'tasks/Team B.md'];
    const untouched = await Promise.all(neighbours.map((id) => fileState(boardFile(id))));
    const [firstInColumn] = columnIds('Internal');

    const task = await service.moveTask('tasks/Mover.md', 'Internal', firstInColumn ?? null);

    expect(task).toMatchObject({ status: 'Internal', order: 0 });
    expect(columnIds('Internal')).toEqual(['tasks/Mover.md', 'tasks/Team B.md', 'tasks/Team A.md']);
    expect(await Promise.all(neighbours.map((id) => fileState(boardFile(id))))).toEqual(untouched);
  });
});

describe('unreadable files', () => {
  it('lists them and never writes, moves or deletes them', async () => {
    await seed('tasks/Broken.md', BROKEN_YAML);
    await openBoard();
    const before = await fileState(boardFile('tasks/Broken.md'));

    const attempts = [
      service.editTask('tasks/Broken.md', { field: 'description', value: 'Fixed' }),
      service.addComment('tasks/Broken.md', 'Hello'),
      service.moveTask('tasks/Broken.md', 'Done', null),
      service.archiveTask('tasks/Broken.md'),
      service.deleteTask('tasks/Broken.md'),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toThrow(BoardMessage.taskUnreadable);

    expect(await fileState(boardFile('tasks/Broken.md'))).toEqual(before);
    expect(service.snapshot().unreadable.map((file) => file.id)).toEqual(['tasks/Broken.md']);
  });
});

describe('project colours', () => {
  it('reads them from projects.md when the board opens and after a rescan', async () => {
    await seed('projects.md', '---\ncolours:\n  Acme website: teal\n---\n');
    await openBoard();
    expect(service.snapshot().projectColours).toEqual({ 'Acme website': 'teal' });

    await seed('projects.md', '---\ncolours:\n  Acme website: red\n---\n');
    await service.rescan();
    expect(service.snapshot().projectColours).toEqual({ 'Acme website': 'red' });
  });

  it('has none without projects.md, and never creates it just by opening', async () => {
    await openBoard();
    expect(service.snapshot().projectColours).toEqual({});
    expect(existsSync(boardFile('projects.md'))).toBe(false);
  });

  it("keeps a colour in the project's note, in the spelling the tasks use, without touching any task", async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    const task = await fileState(boardFile('tasks/Acme website/Fix login bug.md'));
    const snapshots: BoardSnapshot[] = [];
    service.onChange((snapshot) => snapshots.push(snapshot));

    await service.setProjectColour('  acme   WEBSITE ', 'teal');

    expect(await read(ACME_NOTE)).toMatch(/^---\ncolour: teal\n---\n# Acme website\n/);
    expect(existsSync(boardFile('projects.md'))).toBe(false);
    expect(service.snapshot().projectColours).toEqual({ 'Acme website': 'teal' });
    expect(snapshots.at(-1)?.projectColours).toEqual({ 'Acme website': 'teal' });
    expect(await fileState(boardFile('tasks/Acme website/Fix login bug.md'))).toEqual(task);
  });

  it("moves a colour out of projects.md into the project's note, keeping the rest of the file", async () => {
    await seed('projects.md', '---\nowner: me\ncolours:\n  Acme: red\n  Beta: blue\n---\n\nNotes.\n');
    await openBoard();
    await service.setProjectColour('acme', 'green');
    await service.setProjectColour('Beta', null);
    expect(service.snapshot().projectColours).toEqual({ acme: 'green' });
    expect(await read('projects/acme.md')).toMatch(/^---\ncolour: green\n---\n/);
    expect(existsSync(boardFile('projects/Beta.md'))).toBe(false);
    const text = await read('projects.md');
    expect(text).toContain('owner: me');
    expect(text).not.toMatch(/Acme|Beta/);
    expect(text.endsWith('\nNotes.\n')).toBe(true);
  });

  it("takes a project note's colour over its projects.md entry", async () => {
    await seed('projects.md', '---\ncolours:\n  Acme website: red\n  Beta: blue\n---\n');
    await seed(ACME_NOTE, '---\ncolour: teal\n---\n# Acme website\n');
    await seedTask('tasks/Acme website/Task.md', { title: 'Task', status: 'To do', project: 'acme website' });
    await openBoard();
    const colours = projectColourIndex(service.snapshot().projectColours);
    expect(colours.get('acme website')).toBe('teal');
    expect(colours.get('beta')).toBe('blue');
  });

  it("keeps the colour of a project whose name can't be a note's in projects.md", async () => {
    await openBoard();
    await service.setProjectColour('???', 'pink');
    expect(await read('projects.md')).toMatch(/^---\ncolours:\n {2}\?\?\?: pink\n---\n/);
    expect(service.snapshot().projectColours).toEqual({ '???': 'pink' });
  });

  it('lists an unreadable projects.md and never writes it, but still colours a project in its note', async () => {
    await seed('projects.md', '---\ncolours: [unclosed\n---\n');
    await openBoard();
    const before = await fileState(boardFile('projects.md'));

    expect(service.snapshot().projectColours).toEqual({});
    expect(service.snapshot().unreadable.map((file) => file.id)).toEqual(['projects.md']);
    await service.setProjectColour('Acme', 'red');
    await expect(service.setProjectColour('???', 'red')).rejects.toThrow(BoardMessage.projectsFileUnreadable);
    expect(await fileState(boardFile('projects.md'))).toEqual(before);
    expect(service.snapshot().projectColours).toEqual({ Acme: 'red' });
  });

  it('lists an unreadable project note, gives it no colour and never writes it', async () => {
    await seed('projects/Acme.md', '---\ncolour: [unclosed\n---\n');
    await openBoard();
    const before = await fileState(boardFile('projects/Acme.md'));

    expect(service.snapshot().unreadable.map((file) => file.id)).toEqual(['projects/Acme.md']);
    await expect(service.setProjectColour('acme', 'red')).rejects.toThrow(BoardMessage.projectNoteUnreadable);
    expect(await fileState(boardFile('projects/Acme.md'))).toEqual(before);
  });

  it('refuses a colour for an empty project name', async () => {
    await openBoard();
    await expect(service.setProjectColour('   ', 'red')).rejects.toThrow(BoardMessage.projectNameMissing);
    expect(existsSync(boardFile('projects.md'))).toBe(false);
  });

  it.skipIf(!WATCHING_WORKS)('picks up an outside edit to projects.md', async () => {
    const watchingService = new FileBoardService({
      clock,
      trash: new FolderTrash(trashPath),
      watchFolder: (folder, onChange) => watchBoardFolder(folder, onChange, 50),
    });
    try {
      await watchingService.open(boardPath);
      const coloured = waitForSnapshot(watchingService, (snapshot) => snapshot.projectColours['Acme'] === 'pink');
      await seed('projects.md', '---\ncolours:\n  Acme: pink\n---\n');
      expect((await coloured).projectColours).toEqual({ Acme: 'pink' });
    } finally {
      await watchingService.close();
    }
  });
});

describe('project folders', () => {
  const PROJECT_FOLDER = path.join('tasks', 'Acme website');

  function folderExists(relativePath: string): boolean {
    return existsSync(path.join(boardPath, relativePath));
  }

  it('creates a task with a project in its project folder, and one without directly in tasks/', async () => {
    await openBoard();
    const grouped = await service.createTask(NEW_TASK);
    const loose = await service.createTask({ ...NEW_TASK, title: 'Loose', project: null });

    expect(grouped.id).toBe('tasks/Acme website/Fix login bug.md');
    expect(loose.id).toBe('tasks/Loose.md');
    expect(await listFilesRecursively(boardPath)).toEqual([
      ACME_NOTE,
      'tasks/Acme website/Fix login bug.md',
      'tasks/Loose.md',
    ]);
  });

  it('names the folder after the project made safe for a file name, and leaves a name with nothing safe in tasks/', async () => {
    await openBoard();
    const slashed = await service.createTask({ ...NEW_TASK, project: 'Acme / Beta: v2' });
    const unsafe = await service.createTask({ ...NEW_TASK, title: 'Unsafe', project: '???' });

    expect(slashed).toMatchObject({ id: 'tasks/Acme Beta v2/Fix login bug.md', project: 'Acme / Beta: v2' });
    expect(unsafe.id).toBe('tasks/Unsafe.md');
  });

  it('moves the file when the project changes, and removes the folder it left empty', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);

    const moved = await service.editTask('tasks/Acme website/Fix login bug.md', { field: 'project', value: 'Beta' });
    expect(moved.id).toBe('tasks/Beta/Fix login bug.md');
    expect(folderExists(PROJECT_FOLDER)).toBe(false);

    const cleared = await service.editTask(moved.id, { field: 'project', value: null });
    expect(cleared.id).toBe('tasks/Fix login bug.md');
    expect(folderExists(path.join('tasks', 'Beta'))).toBe(false);
    expect(await listFilesRecursively(boardPath)).toEqual([ACME_NOTE, 'projects/Beta.md', 'tasks/Fix login bug.md']);
    expect(service.snapshot().tasks.map((task) => task.id)).toEqual(['tasks/Fix login bug.md']);
  });

  it('keeps a project folder that still holds anything, even only a hidden file', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    await seed('tasks/Acme website/.DS_Store', '');

    await service.editTask('tasks/Acme website/Fix login bug.md', { field: 'project', value: null });

    expect(await listFilesRecursively(path.join(boardPath, 'tasks'))).toEqual([
      'Acme website/.DS_Store',
      'Fix login bug.md',
    ]);
  });

  it('archives into the project folder inside archive/, and restores into the one inside tasks/', async () => {
    await openBoard();
    await service.createTask({ ...NEW_TASK, status: 'Done' });

    const archived = await service.archiveTask('tasks/Acme website/Fix login bug.md');
    expect(archived.id).toBe('archive/Acme website/Fix login bug.md');
    expect(folderExists(PROJECT_FOLDER)).toBe(false);

    const restored = await service.restoreTask(archived.id);
    expect(restored.id).toBe('tasks/Acme website/Fix login bug.md');
    expect(folderExists(path.join('archive', 'Acme website'))).toBe(false);
  });

  it('reuses a project folder whose name differs only in case, so a task is listed once', async () => {
    await seed('tasks/acme WEBSITE/Notes.txt', 'Kept by someone else');
    await openBoard();

    const task = await service.createTask(NEW_TASK);
    await service.rescan();

    expect(task.id).toBe('tasks/acme WEBSITE/Fix login bug.md');
    expect(service.snapshot().tasks.map((snapshotTask) => snapshotTask.id)).toEqual([
      'tasks/acme WEBSITE/Fix login bug.md',
    ]);
  });

  it("leaves a task directly in tasks/ when a file has its project folder's name", async () => {
    await seed('tasks/Acme website', 'Not a folder');
    await openBoard();

    expect((await service.createTask(NEW_TASK)).id).toBe('tasks/Fix login bug.md');
  });

  it('moves a task filed before project folders into its folder on its next update, but never just by opening', async () => {
    await seedTask('tasks/Legacy.md', { title: 'Legacy', status: 'To do', project: 'Acme website' });
    const before = await fileState(boardFile('tasks/Legacy.md'));
    await openBoard();
    expect(await fileState(boardFile('tasks/Legacy.md'))).toEqual(before);

    const task = await service.addComment('tasks/Legacy.md', 'Filed at last');

    expect(task.id).toBe('tasks/Acme website/Legacy.md');
    expect(await listFilesRecursively(boardPath)).toEqual([ACME_NOTE, 'tasks/Acme website/Legacy.md']);
    expect(service.snapshot().tasks.map((snapshotTask) => snapshotTask.id)).toEqual(['tasks/Acme website/Legacy.md']);
  });

  it('moves a task into its folder when it changes column, but never moves a neighbour that is only renumbered', async () => {
    await seedTask('tasks/A.md', { title: 'A', status: 'To do', order: 1, project: 'Acme website' });
    await seedTask('tasks/B.md', { title: 'B', status: 'To do', order: 1.0000001, project: 'Acme website' });
    await seedTask('tasks/C.md', { title: 'C', status: 'In progress', order: 1, project: 'Beta' });
    await openBoard();

    const task = await service.moveTask('tasks/C.md', 'To do', 'tasks/B.md');

    expect(task.id).toBe('tasks/Beta/C.md');
    expect(await read('tasks/B.md')).toContain('order: 3\n');
    expect(await listFilesRecursively(boardPath)).toEqual([
      'projects/Beta.md',
      'tasks/A.md',
      'tasks/B.md',
      'tasks/Beta/C.md',
    ]);
    expect(await read('tasks/B.md')).toContain('project: Acme website\n');
  });

  it('removes a project folder that deleting its last task left empty', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);

    await service.deleteTask('tasks/Acme website/Fix login bug.md');

    expect(folderExists(PROJECT_FOLDER)).toBe(false);
    expect(folderExists('tasks')).toBe(true);
  });
});

describe('task ids', () => {
  it.each([
    ['tasks/../../escape.md'],
    ['../escape.md'],
    ['/etc/hosts.md'],
    ['tasks/Acme/deeper/Deep.md'],
    ['tasks/../escape.md'],
    ['tasks/./Note.md'],
    ['tasks/.drafts/Note.md'],
    ['tasks//Note.md'],
    ['tasks/Acme\\Note.md'],
    ['tasks\\..\\escape.md'],
    ['notes/Note.md'],
    ['tasks/.hidden.md'],
    ['tasks/Note.txt'],
    ['tasks/'],
    [''],
    [42],
    [null],
  ])('rejects %j', async (id) => {
    await openBoard();
    await expect(service.editTask(id as string, { field: 'description', value: 'x' })).rejects.toThrow(
      BoardMessage.invalidTaskId,
    );
    await expect(service.deleteTask(id as string)).rejects.toThrow(BoardMessage.invalidTaskId);
    expect(() => service.absolutePath(id as string)).toThrow(BoardMessage.invalidTaskId);
  });

  it('resolves a valid id to its file inside the board folder', async () => {
    await openBoard();
    expect(service.absolutePath('archive/Old note.md')).toBe(path.join(boardPath, 'archive', 'Old note.md'));
    expect(service.absolutePath('tasks/Acme/Note.md')).toBe(path.join(boardPath, 'tasks', 'Acme', 'Note.md'));
  });
});

describe('safe writes', () => {
  it('leaves no temporary files behind', async () => {
    await openBoard();
    await service.createTask({ ...NEW_TASK, status: 'Done' });
    await service.editTask('tasks/Acme website/Fix login bug.md', { field: 'title', value: 'Renamed' });
    await service.addComment('tasks/Acme website/Renamed.md', 'Note');
    await service.archiveTask('tasks/Acme website/Renamed.md');
    await service.restoreTask('archive/Acme website/Renamed.md');
    await service.createTask({ ...NEW_TASK, title: 'Another' });
    await service.moveTask('tasks/Acme website/Another.md', 'Done', 'tasks/Acme website/Renamed.md');

    const files = await listFilesRecursively(boardPath);
    expect(files).toEqual([ACME_NOTE, 'tasks/Acme website/Another.md', 'tasks/Acme website/Renamed.md']);
    expect(files.some((file) => file.includes('mboard-tmp'))).toBe(false);
  });
});

describe('renaming a project', () => {
  beforeEach(async () => {
    await seedTask('tasks/Acme/A.md', { title: 'A', status: 'To do', project: 'Acme' });
    await seedTask('tasks/Acme/B.md', { title: 'B', status: 'Done', project: 'Acme' });
    await seedTask('archive/Acme/Old.md', {
      title: 'Old',
      status: 'Done',
      project: 'Acme',
      archived: '2026-11-10T10:00:00',
    });
    await seedTask('tasks/Other.md', { title: 'Other', status: 'To do', project: 'Beta' });
    await seed('projects/Acme.md', '---\ncolour: teal\n---\n# Acme\n\nMy notes.\n');
  });

  it("renames it on every live and archived task, moving their files and keeping each task's age", async () => {
    await openBoard();
    const result = await service.renameProject('acme', 'Globex');

    expect(result).toEqual({
      project: 'Globex',
      renamed: 3,
      moves: [
        { from: 'archive/Acme/Old.md', to: 'archive/Globex/Old.md' },
        { from: 'tasks/Acme/A.md', to: 'tasks/Globex/A.md' },
        { from: 'tasks/Acme/B.md', to: 'tasks/Globex/B.md' },
      ],
    });
    expect(await listFilesRecursively(boardPath)).toEqual([
      'archive/Globex/Old.md',
      'projects/Globex.md',
      'tasks/Globex/A.md',
      'tasks/Globex/B.md',
      'tasks/Other.md',
    ]);
    const renamed = taskIn(service.snapshot(), 'tasks/Globex/A.md');
    expect(renamed).toMatchObject({ project: 'Globex', updated: '2026-11-01T09:00:00' });
    expect(renamed?.history.at(-1)?.text).toBe('Project renamed from Acme to Globex');
    expect(taskIn(service.snapshot(), 'archive/Globex/Old.md')).toMatchObject({ project: 'Globex', isArchived: true });
    expect(await read('tasks/Globex/A.md')).toContain('project: "[[Globex]]"\n');
    expect(await read('projects/Globex.md')).toBe('---\ncolour: teal\n---\n# Globex\n\nMy notes.\n');
    expect(service.snapshot().projectColours).toEqual({ Globex: 'teal' });
  });

  it('respells a project whose name changes only in case, with its folders and note', async () => {
    await openBoard();
    const result = await service.renameProject('Acme', 'ACME');

    expect(result.renamed).toBe(3);
    expect(result.moves).toEqual([
      { from: 'archive/Acme/Old.md', to: 'archive/ACME/Old.md' },
      { from: 'tasks/Acme/A.md', to: 'tasks/ACME/A.md' },
      { from: 'tasks/Acme/B.md', to: 'tasks/ACME/B.md' },
    ]);
    expect(await listFilesRecursively(boardPath)).toEqual([
      'archive/ACME/Old.md',
      'projects/ACME.md',
      'tasks/ACME/A.md',
      'tasks/ACME/B.md',
      'tasks/Other.md',
    ]);
    expect(service.snapshot().tasks.filter((task) => task.project === 'ACME')).toHaveLength(3);
    expect(await read('projects/ACME.md')).toContain('# ACME\n');
  });

  it('merges into a project that already has the new name, which keeps its spelling, note and colour', async () => {
    await seed('projects/Beta.md', '---\ncolour: blue\n---\n# Beta\n');
    await openBoard();
    const result = await service.renameProject('Acme', 'beta');

    expect(result).toMatchObject({ project: 'Beta', renamed: 3 });
    expect(await listFilesRecursively(boardPath)).toEqual([
      'archive/Beta/Old.md',
      'projects/Beta.md',
      'tasks/Beta/A.md',
      'tasks/Beta/B.md',
      'tasks/Other.md',
    ]);
    expect(await listFilesRecursively(trashPath)).toEqual(['Acme.md']);
    expect(service.snapshot().projectColours).toEqual({ Beta: 'blue' });
  });

  it("carries a colour from projects.md into the renamed project's note", async () => {
    await rm(boardFile('projects/Acme.md'));
    await seed('projects.md', '---\ncolours:\n  Acme: red\n---\n');
    await openBoard();
    await service.renameProject('Acme', 'Globex');

    expect(await read('projects/Globex.md')).toMatch(/^---\ncolour: red\n---\n# Globex\n/);
    expect(await read('projects.md')).not.toContain('Acme');
    expect(service.snapshot().projectColours).toEqual({ Globex: 'red' });
  });

  it("refuses before writing anything when the project's note can't be read", async () => {
    await seed('projects/Globex.md', '---\ncolour: [unclosed\n---\n');
    await openBoard();
    const before = await fileState(boardFile('tasks/Acme/A.md'));

    await expect(service.renameProject('Acme', 'Globex')).rejects.toThrow(BoardMessage.projectNoteUnreadable);
    expect(await fileState(boardFile('tasks/Acme/A.md'))).toEqual(before);
    expect(existsSync(boardFile('projects/Acme.md'))).toBe(true);
  });

  it('stops at a task it cannot write, says how far it got, and finishes when renamed again', async () => {
    await openBoard();
    const write = AtomicFileWriter.prototype.write;
    const failing = vi
      .spyOn(AtomicFileWriter.prototype, 'write')
      .mockImplementation(function (this: AtomicFileWriter, target, content) {
        if (target.endsWith(path.join('Acme', 'B.md'))) return Promise.reject(new Error('The disk is full.'));
        return write.call(this, target, content);
      });

    await expect(service.renameProject('Acme', 'Globex')).rejects.toThrow(
      'Renamed the project on 2 of 3 tasks, then stopped: The disk is full. Rename it again to finish.',
    );
    expect(taskIn(service.snapshot(), 'tasks/Acme/B.md')?.project).toBe('Acme');

    failing.mockRestore();
    const result = await service.renameProject('Acme', 'Globex');

    expect(result).toMatchObject({ project: 'Globex', renamed: 1 });
    expect(service.snapshot().tasks.filter((task) => task.project === 'Globex')).toHaveLength(3);
    expect(await read('projects/Globex.md')).toContain('colour: teal');
  });

  it('skips a task whose project an outside edit changed since the board last read it', async () => {
    await openBoard();
    await seedTask('tasks/Acme/B.md', { title: 'B', status: 'Done', project: 'Zeta' });

    const result = await service.renameProject('Acme', 'Globex');

    expect(result.renamed).toBe(2);
    expect(await read('tasks/Acme/B.md')).toContain('project: Zeta\n');
  });

  it('refuses an empty name, and changes nothing when the name stays the same', async () => {
    await openBoard();
    const before = await fileState(boardFile('tasks/Other.md'));
    await expect(service.renameProject('Acme', '   ')).rejects.toThrow(BoardMessage.projectNewNameMissing);
    expect(await service.renameProject('Beta', ' Beta ')).toEqual({ project: 'Beta', renamed: 0, moves: [] });
    expect(await fileState(boardFile('tasks/Other.md'))).toEqual(before);
  });
});

describe('project notes', () => {
  it("links a task to its project's note by its path from the vault's root", async () => {
    await mkdir(path.join(root, 'Vault', '.obsidian'));
    await openBoard();
    await service.createTask(NEW_TASK);

    expect(await read('tasks/Acme website/Fix login bug.md')).toContain(
      'project: "[[Board/projects/Acme website|Acme website]]"\n',
    );
    expect(await read(ACME_NOTE)).toMatch(/^# Acme website\n/);
  });

  it('links by note name alone when the board folder is named with a character that would break a link', async () => {
    const hashBoard = path.join(root, 'Vault', 'Board #2');
    await mkdir(path.join(root, 'Vault', '.obsidian'));
    await mkdir(path.join(hashBoard, 'tasks'), { recursive: true });
    await service.open(hashBoard);
    const task = await service.createTask(NEW_TASK);

    expect(await readBoardFile(hashBoard, task.id)).toContain('project: "[[Acme website]]"\n');
    expect(taskIn(service.snapshot(), task.id)?.project).toBe('Acme website');
  });

  it('creates a note only when an update links to it, never just by opening a board', async () => {
    await seedTask('tasks/Plain.md', { title: 'Plain', status: 'To do', project: 'Acme website' });
    await openBoard();
    expect(existsSync(boardFile('projects'))).toBe(false);

    await service.addComment('tasks/Plain.md', 'Hello');
    expect(await read(ACME_NOTE)).toMatch(/^# Acme website\n/);
  });

  it('keeps a link the person wrote to a note of their own, and makes no note for it', async () => {
    await seed('tasks/Linked.md', taskFileText({ title: 'Linked', status: 'To do', project: '"[[Clients/Acme]]"' }));
    await openBoard();
    await service.addComment('tasks/Linked.md', 'Hello');

    expect(await read('tasks/Acme/Linked.md')).toContain('project: "[[Clients/Acme]]"\n');
    expect(existsSync(boardFile('projects'))).toBe(false);
  });

  it("creates a project's note to open it, matching the name ignoring case", async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    expect(await service.projectNotePath('ACME WEBSITE')).toBe(boardFile(ACME_NOTE));
    await expect(service.projectNotePath('???')).rejects.toThrow(BoardMessage.projectWithoutNote);
  });
});
