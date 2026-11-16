import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_FOLDER_MESSAGE, NOT_A_BOARD_MESSAGE, OBSIDIAN_INTERNAL_FOLDER_MESSAGE, VAULT_WARNING_MESSAGE } from '../../domain';
import type { AppState } from '../../shared/contract';
import { FileBoardService } from '../board/board-service';
import { FileSettingsStore } from '../settings/settings-store';
import { FakeClock } from '../test-support/board-test-kit';
import { inertFolderWatch } from '../test-support/folder-watching';
import { createTemporaryFolder, listFilesRecursively, removeTemporaryFolder } from '../test-support/temporary-folder';
import { FolderTrash } from '../trash/folder-trash';
import { checkBoardFolder, probeFolder } from './board-folder';
import {
  CONFIRMATION_EXPIRED_MESSAGE,
  FileBoardSetupService,
  UNUSABLE_FOLDER_MESSAGES,
  type BoardSetupOptions,
} from './board-setup-service';

let root: string;
let vault: string;
let outside: string;
let settings: FileSettingsStore;
let board: FileBoardService;
let onFirstSetup: ReturnType<typeof vi.fn<() => Promise<void>>>;
const services: FileBoardSetupService[] = [];

function createSetup(overrides: Partial<BoardSetupOptions> = {}): FileBoardSetupService {
  const service = new FileBoardSetupService({ settings, board, onFirstSetup, ...overrides });
  services.push(service);
  return service;
}

async function folder(...segments: string[]): Promise<string> {
  const folderPath = path.join(...segments);
  await mkdir(folderPath, { recursive: true });
  return folderPath;
}

const isRunningAsRoot = process.getuid?.() === 0;

beforeEach(async () => {
  root = await createTemporaryFolder('mboard-setup-');
  vault = await folder(root, 'Vault');
  await folder(vault, '.obsidian');
  outside = await folder(root, 'Elsewhere');
  settings = new FileSettingsStore(await folder(root, 'user-data'));
  board = new FileBoardService({
    clock: new FakeClock(new Date(2026, 10, 16, 9, 30, 0)),
    trash: new FolderTrash(path.join(root, 'Trash')),
    watchFolder: inertFolderWatch,
  });
  onFirstSetup = vi.fn<() => Promise<void>>(async () => undefined);
});

afterEach(async () => {
  services.length = 0;
  await board.close();
  await chmod(root, 0o755).catch(() => undefined);
  await removeTemporaryFolder(root);
});

describe('probing a chosen folder', () => {
  it('lists hidden entries too and finds the vault above the folder', async () => {
    const chosen = await folder(vault, 'Work', 'Board');
    await writeFile(path.join(chosen, '.DS_Store'), '');
    await folder(chosen, 'tasks');

    expect(await probeFolder(chosen)).toEqual({
      path: chosen,
      entries: expect.arrayContaining([
        { name: '.DS_Store', isDirectory: false },
        { name: 'tasks', isDirectory: true },
      ]),
      isInsideObsidianVault: true,
    });
    expect((await probeFolder(outside)).isInsideObsidianVault).toBe(false);
  });

  it('reports why a board folder can not be opened, without creating it', async () => {
    const missing = path.join(root, 'Missing');
    const file = path.join(root, 'file.md');
    await writeFile(file, 'not a folder');

    expect(await checkBoardFolder(vault)).toBeNull();
    expect(await checkBoardFolder(missing)).toBe('notFound');
    expect(await checkBoardFolder(path.join(file, 'Board'))).toBe('notFound');
    expect(await checkBoardFolder(file)).toBe('notADirectory');
    expect(existsSync(missing)).toBe(false);
  });
});

describe('choosing a board folder', () => {
  it('sets up an empty folder inside a vault as a new board, saves it and opens it', async () => {
    const chosen = await folder(vault, 'Board');
    await writeFile(path.join(chosen, '.DS_Store'), '');
    const setup = createSetup();

    const choice = await setup.choose(chosen);

    expect(choice).toEqual({ kind: 'accepted', state: { kind: 'ready', boardPath: chosen, boardName: 'Board' } });
    expect(await listFilesRecursively(chosen)).toEqual(['.DS_Store', 'README.md']);
    expect(existsSync(path.join(chosen, 'tasks'))).toBe(true);
    expect(existsSync(path.join(chosen, 'archive'))).toBe(true);
    expect(await readFile(path.join(chosen, 'README.md'), 'utf8')).toMatch(/^# Board\n/);
    expect((await settings.read()).boardPath).toBe(chosen);
    expect(await setup.getAppState()).toEqual(choice.kind === 'accepted' ? choice.state : null);
    expect(onFirstSetup).toHaveBeenCalledTimes(1);
  });

  it('opens an existing board without writing to it', async () => {
    const chosen = await folder(vault, 'Existing');
    await folder(chosen, 'tasks');
    await writeFile(path.join(chosen, 'tasks', 'Task.md'), 'A task\n');
    const setup = createSetup();

    const choice = await setup.choose(chosen);

    expect(choice).toMatchObject({ kind: 'accepted', state: { kind: 'ready', boardName: 'Existing' } });
    expect(await listFilesRecursively(chosen)).toEqual(['tasks/Task.md']);
    expect(board.snapshot().tasks.map((task) => task.id)).toEqual(['tasks/Task.md']);
  });

  it.each([
    ['a folder that is not empty and not a board', ['Vault', 'Notes'], NOT_A_BOARD_MESSAGE],
    ['a hidden folder', ['Vault', '.hidden'], HIDDEN_FOLDER_MESSAGE],
    ['a folder inside .obsidian', ['Vault', '.obsidian', 'plugins'], OBSIDIAN_INTERNAL_FOLDER_MESSAGE],
  ])('rejects %s', async (_description, segments, message) => {
    const chosen = await folder(root, ...segments);
    await writeFile(path.join(chosen, 'note.md'), 'A note');
    const setup = createSetup();

    expect(await setup.choose(chosen)).toEqual({ kind: 'rejected', path: chosen, message });
    expect(await setup.getAppState()).toEqual({ kind: 'needsSetup' });
    expect((await settings.read()).boardPath).toBeNull();
  });

  it('rejects a folder holding only an iCloud placeholder', async () => {
    const chosen = await folder(vault, 'Downloading');
    await writeFile(path.join(chosen, '.Task.md.icloud'), '');

    expect(await createSetup().choose(chosen)).toMatchObject({ kind: 'rejected', message: NOT_A_BOARD_MESSAGE });
  });

  it('rejects a folder that does not exist without creating it', async () => {
    const missing = path.join(vault, 'Missing');

    expect(await createSetup().choose(missing)).toEqual({
      kind: 'rejected',
      path: missing,
      message: UNUSABLE_FOLDER_MESSAGES.notFound,
    });
    expect(existsSync(missing)).toBe(false);
  });

  it('asks for confirmation outside a vault, and sets the board up once confirmed', async () => {
    const chosen = await folder(outside, 'Board');
    const setup = createSetup();

    expect(await setup.choose(chosen)).toEqual({ kind: 'needsConfirmation', path: chosen, message: VAULT_WARNING_MESSAGE });
    expect(await listFilesRecursively(chosen)).toEqual([]);

    expect(await setup.confirm(chosen)).toMatchObject({ kind: 'accepted', state: { kind: 'ready', boardPath: chosen } });
    expect(await listFilesRecursively(chosen)).toEqual(['README.md']);
  });

  it('confirms only the folder it last asked about', async () => {
    const asked = await folder(outside, 'Asked');
    const other = await folder(outside, 'Other');
    const setup = createSetup();
    await setup.choose(asked);

    expect(await setup.confirm(other)).toEqual({ kind: 'rejected', path: other, message: CONFIRMATION_EXPIRED_MESSAGE });
    expect(await listFilesRecursively(other)).toEqual([]);
    expect(await createSetup().confirm(asked)).toMatchObject({ kind: 'rejected' });
  });

  it('runs the first-setup step only for the very first board folder', async () => {
    const setup = createSetup();
    await setup.choose(await folder(vault, 'First'));
    await setup.choose(await folder(vault, 'Second'));

    expect(onFirstSetup).toHaveBeenCalledTimes(1);
    expect((await settings.read()).boardPath).toBe(path.join(vault, 'Second'));
    expect(await setup.getAppState()).toMatchObject({ kind: 'ready', boardName: 'Second' });
  });

  it('tells listeners about every state it settles on', async () => {
    const setup = createSetup();
    const states: AppState[] = [];
    setup.onStateChange((state) => states.push(state));
    await setup.start();
    await setup.choose(await folder(vault, 'Board'));

    expect(states.map((state) => state.kind)).toEqual(['needsSetup', 'ready']);
  });

  it('refuses a relative path', async () => {
    await expect(createSetup().choose('Vault/Board')).rejects.toThrow("That isn't a valid folder path.");
  });
});

describe('the app state at launch', () => {
  it('needs setup when no board folder was saved', async () => {
    expect(await createSetup().start()).toEqual({ kind: 'needsSetup' });
  });

  it('opens the saved board folder', async () => {
    const saved = await folder(vault, 'Board');
    await folder(saved, 'tasks');
    await settings.update({ boardPath: saved });

    expect(await createSetup().start()).toEqual({ kind: 'ready', boardPath: saved, boardName: 'Board' });
  });

  it('reports a saved folder that is missing, and never creates it', async () => {
    const missing = path.join(vault, 'Gone');
    await settings.update({ boardPath: missing });

    expect(await createSetup().start()).toEqual({ kind: 'unavailable', path: missing, reason: 'notFound' });
    expect(existsSync(missing)).toBe(false);
  });

  it('reports a saved path that is a file', async () => {
    const file = path.join(vault, 'Board.md');
    await writeFile(file, 'oops');
    await settings.update({ boardPath: file });

    expect(await createSetup().start()).toMatchObject({ kind: 'unavailable', reason: 'notADirectory' });
  });

  it.skipIf(isRunningAsRoot)('reports a saved folder it may not read', async () => {
    const locked = await folder(vault, 'Locked');
    await chmod(locked, 0o000);
    await settings.update({ boardPath: locked });

    try {
      expect(await createSetup().start()).toMatchObject({ kind: 'unavailable', reason: 'permissionDenied' });
    } finally {
      await chmod(locked, 0o755);
    }
  });

  it('opens the folder once it is back, on retry', async () => {
    const later = path.join(vault, 'Later');
    await settings.update({ boardPath: later });
    const setup = createSetup();
    await setup.start();
    await folder(later, 'tasks');

    expect(await setup.retry()).toEqual({ kind: 'ready', boardPath: later, boardName: 'Later' });
  });

  describe('with MBOARD_BOARD_PATH', () => {
    it('sets up a new-board candidate without asking, even outside a vault, and does not save it', async () => {
      const launchBoard = await folder(outside, 'Launch board');
      const setup = createSetup({ launchBoardPath: launchBoard });

      expect(await setup.start()).toEqual({ kind: 'ready', boardPath: launchBoard, boardName: 'Launch board' });
      expect(await listFilesRecursively(launchBoard)).toEqual(['README.md']);
      expect((await settings.read()).boardPath).toBeNull();
      expect(onFirstSetup).not.toHaveBeenCalled();
    });

    it('wins over the saved board folder', async () => {
      const saved = await folder(vault, 'Saved');
      const launchBoard = await folder(vault, 'Launch');
      await settings.update({ boardPath: saved });

      expect(await createSetup({ launchBoardPath: launchBoard }).start()).toMatchObject({ boardPath: launchBoard });
    });

    it('needs setup when the folder is not a board and not empty', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const notes = await folder(vault, 'Notes');
      await writeFile(path.join(notes, 'note.md'), 'A note');

      expect(await createSetup({ launchBoardPath: notes }).start()).toEqual({ kind: 'needsSetup' });
      expect(await listFilesRecursively(notes)).toEqual(['note.md']);
    });

    it('reports a missing folder without creating it', async () => {
      const missing = path.join(vault, 'Missing');

      expect(await createSetup({ launchBoardPath: missing }).start()).toEqual({
        kind: 'unavailable',
        path: missing,
        reason: 'notFound',
      });
      expect(existsSync(missing)).toBe(false);
    });
  });
});
