import { existsSync } from 'node:fs';
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { columnTasks } from '../../domain';
import type { BoardSnapshot, NewTaskInput, Task } from '../../shared/contract';
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
import { FolderTrash } from '../trash/folder-trash';
import { BoardMessage } from './board-messages';
import { FileBoardService } from './board-service';
import { watchBoardFolder } from './board-watcher';

const NOW = new Date(2026, 10, 16, 9, 30, 0);
const WATCHING_WORKS = await canWatchFoldersRecursively();

const NEW_TASK: NewTaskInput = {
  title: 'Fix login bug',
  status: 'In progress',
  responsibility: 'Client',
  project: 'Acme website',
  due: '2026-11-20',
  description: 'The login fails.',
};

const BROKEN_YAML = '---\ntitle: [unclosed\n---\nBody\n';

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
  return seed(relativePath, taskFileText({ created: '2026-11-01T09:00:00', updated: '2026-11-01T09:00:00', ...fields }));
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
    await seed('tasks/nested/Deep.md', 'too deep');
    await seed('README.md', '# Board');

    await openBoard();
    const snapshot = service.snapshot();

    expect(snapshot.tasks.map((task) => task.id)).toEqual(['archive/Beta.md', 'tasks/Alpha.md', 'tasks/Plain note.md']);
    expect(taskIn(snapshot, 'archive/Beta.md')).toMatchObject({ isArchived: true, archivedAt: '2026-11-10T10:00:00' });
    expect(taskIn(snapshot, 'tasks/Plain note.md')).toMatchObject({ title: 'Plain note', description: 'Just text' });
    expect(snapshot.unreadable).toEqual([{ id: 'tasks/Broken.md', reason: expect.stringContaining("isn't valid YAML") }]);
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
      id: 'tasks/Fix login bug.md',
      title: 'Fix login bug',
      status: 'In progress',
      created: '2026-11-16T09:30:00',
      updated: '2026-11-16T09:30:00',
      order: 1,
      isArchived: false,
    });
    expect(task.history).toMatchObject([{ at: '2026-11-16 09:30', text: 'Created in In progress' }]);
    expect(await read('tasks/Fix login bug.md')).toBe(
      [
        '---',
        'title: "Fix login bug"',
        'status: In progress',
        'responsibility: Client',
        'project: Acme website',
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
          '{"field":"responsibility","from":null,"to":"Client"},{"field":"project","from":null,"to":"Acme website"},' +
          '{"field":"due","from":null,"to":"2026-11-20"},{"field":"description","from":null,"to":"The login fails."}]} -->',
        '',
      ].join('\n'),
    );

    const second = await service.createTask({ ...NEW_TASK, title: 'Second' });
    expect(second.order).toBe(0);
    expect(columnIds('In progress')).toEqual(['tasks/Second.md', 'tasks/Fix login bug.md']);
  });

  it('numbers a clashing file name, ignoring case, even for concurrent creates', async () => {
    await seed('tasks/fix LOGIN bug.md', 'An outside note\n');
    await openBoard();
    const created = await Promise.all([service.createTask(NEW_TASK), service.createTask(NEW_TASK)]);

    expect(created.map((task) => task.id).sort()).toEqual(['tasks/Fix login bug 2.md', 'tasks/Fix login bug 3.md']);
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

    expect(await listFilesRecursively(boardPath)).toEqual(['tasks/Fix login bug.md']);
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
    [{ field: 'responsibility', value: 'Internal' }, 'Responsibility changed from Client to Internal'],
    [{ field: 'due', value: '2026-12-01' }, 'Due date changed from 2026-11-20 to 2026-12-01'],
  ] as const)('applies %o, bumps updated and adds one history entry', async (edit, historyText) => {
    const task = await service.editTask('tasks/Fix login bug.md', edit);

    expect(task.updated).toBe('2026-11-16T11:00:00');
    expect(task.history).toHaveLength(2);
    expect(task.history[1]).toMatchObject({ at: '2026-11-16 11:00', text: historyText, ledger: { at: '2026-11-16T11:00:00' } });
    expect(await read('tasks/Fix login bug.md')).toContain(`- 2026-11-16 11:00 — ${historyText} <!-- mboard-ledger {`);
  });

  it('renames the file when the title changes', async () => {
    const task = await service.editTask('tasks/Fix login bug.md', { field: 'title', value: 'Fix: sign-in bug?' });

    expect(task.id).toBe('tasks/Fix sign-in bug.md');
    expect(task.history.at(-1)?.text).toBe('Title changed from "Fix login bug" to "Fix: sign-in bug?"');
    expect(await listFilesRecursively(boardPath)).toEqual(['tasks/Fix sign-in bug.md']);
    expect(await read('tasks/Fix sign-in bug.md')).toContain('title: "Fix: sign-in bug?"');
    expect(service.snapshot().tasks.map((snapshotTask) => snapshotTask.id)).toEqual(['tasks/Fix sign-in bug.md']);
  });

  it('renames the file for a change of case only', async () => {
    const task = await service.editTask('tasks/Fix login bug.md', { field: 'title', value: 'Fix Login Bug' });

    expect(task.id).toBe('tasks/Fix Login Bug.md');
    expect(await listFilesRecursively(boardPath)).toEqual(['tasks/Fix Login Bug.md']);
  });

  it('numbers the new name when another file already has it', async () => {
    await seed('tasks/Other.md', 'Someone else\n');
    const task = await service.editTask('tasks/Fix login bug.md', { field: 'title', value: 'other' });

    expect(task.id).toBe('tasks/other 2.md');
  });

  it('writes nothing for an unchanged value', async () => {
    const before = await fileState(boardFile('tasks/Fix login bug.md'));
    const task = await service.editTask('tasks/Fix login bug.md', { field: 'project', value: ' acme WEBSITE ' });

    expect(task.history).toHaveLength(1);
    expect(await fileState(boardFile('tasks/Fix login bug.md'))).toEqual(before);
  });

  it('rereads the file, so an outside edit is never overwritten with a stale copy', async () => {
    const original = await read('tasks/Fix login bug.md');
    await writeFile(boardFile('tasks/Fix login bug.md'), original.replace('The login fails.', 'Edited in Obsidian.'));

    await service.editTask('tasks/Fix login bug.md', { field: 'responsibility', value: 'Me' });

    expect(await read('tasks/Fix login bug.md')).toContain('Edited in Obsidian.');
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
    await service.editTask('tasks/Reserialised.md', { field: 'responsibility', value: 'Internal' });

    const text = await read('tasks/Reserialised.md');
    const keys = text
      .split('---')[1]
      ?.split('\n')
      .filter((line) => /^[a-z]+:/.test(line))
      .map((line) => line.split(':')[0]);
    expect(keys).toEqual(['title', 'status', 'responsibility', 'created', 'updated', 'tags', 'aliases', 'cssclasses']);
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
    const task = await service.addComment('tasks/Fix login bug.md', '  Asked for the credentials.  ');

    expect(task.comments).toEqual([{ at: '2026-11-16 09:35', text: 'Asked for the credentials.' }]);
    expect(task.history.at(-1)).toEqual({
      at: '2026-11-16 09:35',
      text: 'Comment added',
      ledger: {
        v: 1,
        at: '2026-11-16T09:35:00',
        changes: [{ field: 'comments', added: [{ at: '2026-11-16 09:35', text: 'Asked for the credentials.' }], removed: [] }],
      },
    });
    expect(await read('tasks/Fix login bug.md')).toContain(
      '## Comments\n\n### 2026-11-16 09:35\n\nAsked for the credentials.\n\n## History',
    );
  });

  it('rejects an empty comment', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    await expect(service.addComment('tasks/Fix login bug.md', '   ')).rejects.toThrow("A comment can't be empty.");
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

  it('restores an archived task to the top of Done', async () => {
    await service.archiveTask('tasks/Shipped.md');
    clock.advanceMinutes(10);
    const task = await service.restoreTask('archive/Shipped.md');

    expect(task).toMatchObject({ id: 'tasks/Shipped.md', status: 'Done', isArchived: false, archivedAt: null, order: 1 });
    expect(task.history.slice(-2).map((entry) => entry.text)).toEqual(['Archived', 'Restored to Done']);
    expect(await read('tasks/Shipped.md')).not.toContain('archived:');
    expect(columnIds('Done')).toEqual(['tasks/Shipped.md', 'tasks/Released.md']);
  });

  it('keeps archived tasks read-only apart from restore and delete', async () => {
    await service.archiveTask('tasks/Shipped.md');
    const archived = await fileState(boardFile('archive/Shipped.md'));

    await expect(service.editTask('archive/Shipped.md', { field: 'title', value: 'New' })).rejects.toThrow(
      BoardMessage.archivedReadOnly,
    );
    await expect(service.addComment('archive/Shipped.md', 'Hello')).rejects.toThrow(BoardMessage.archivedReadOnly);
    await expect(service.moveTask('archive/Shipped.md', 'To do', null)).rejects.toThrow(BoardMessage.archivedReadOnly);
    await expect(service.archiveTask('archive/Shipped.md')).rejects.toThrow(BoardMessage.alreadyArchived);
    await expect(service.restoreTask('tasks/Working.md')).rejects.toThrow(BoardMessage.notArchived);
    expect(await fileState(boardFile('archive/Shipped.md'))).toEqual(archived);

    await service.deleteTask('archive/Shipped.md');
    expect(await listFilesRecursively(trashPath)).toEqual(['Shipped.md']);
  });
});

describe('deleting', () => {
  it('moves the file into the trash folder', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    await service.deleteTask('tasks/Fix login bug.md');

    expect(await listFilesRecursively(boardPath)).toEqual([]);
    expect(await listFilesRecursively(trashPath)).toEqual(['Fix login bug.md']);
    expect(service.snapshot().tasks).toEqual([]);
  });

  it('rejects a task whose file is already gone', async () => {
    await openBoard();
    await service.createTask(NEW_TASK);
    await unlink(boardFile('tasks/Fix login bug.md'));

    await expect(service.deleteTask('tasks/Fix login bug.md')).rejects.toThrow(BoardMessage.taskMissing);
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
        const appeared = waitForSnapshot(watchingService, (snapshot) => taskIn(snapshot, 'tasks/From Obsidian.md') !== undefined);
        await seed('tasks/From Obsidian.md', added);
        expect(taskIn(await appeared, 'tasks/From Obsidian.md')?.status).toBe('In progress');

        const edited = added.replace('In progress', 'Done');
        const changed = waitForSnapshot(watchingService, (snapshot) => taskIn(snapshot, 'tasks/From Obsidian.md')?.status === 'Done');
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
    await service.editTask('tasks/Fix login bug.md', { field: 'title', value: 'Fix login bug' });

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]?.tasks.map((task) => task.id)).toEqual(['tasks/Fix login bug.md']);
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

describe('task ids', () => {
  it.each([
    ['tasks/../../escape.md'],
    ['../escape.md'],
    ['/etc/hosts.md'],
    ['tasks/nested/Deep.md'],
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
  });
});

describe('safe writes', () => {
  it('leaves no temporary files behind', async () => {
    await openBoard();
    await service.createTask({ ...NEW_TASK, status: 'Done' });
    await service.editTask('tasks/Fix login bug.md', { field: 'title', value: 'Renamed' });
    await service.addComment('tasks/Renamed.md', 'Note');
    await service.archiveTask('tasks/Renamed.md');
    await service.restoreTask('archive/Renamed.md');
    await service.createTask({ ...NEW_TASK, title: 'Another' });
    await service.moveTask('tasks/Another.md', 'Done', 'tasks/Renamed.md');

    const files = await listFilesRecursively(boardPath);
    expect(files).toEqual(['tasks/Another.md', 'tasks/Renamed.md']);
    expect(files.some((file) => file.includes('mboard-tmp'))).toBe(false);
  });
});
