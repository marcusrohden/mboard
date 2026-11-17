import { describe, expect, it, vi } from 'vitest';
import type { AppUpdateStatus, BoardSnapshot, NewTaskInput, RevertExpectation, Task } from '../../shared/contract';
import { IPC } from '../../shared/contract';
import type { BoardService, BoardSetupService } from '../ports';
import { createInvokeHandlers, type InvokeHandlerDependencies } from './invoke-handlers';

const SNAPSHOT: BoardSnapshot = { tasks: [], unreadable: [], now: '2026-11-16T09:30:00', today: '2026-11-16' };
const TASK = { id: 'tasks/A.md', title: 'A' } as Task;
const UPDATE_STATUS: AppUpdateStatus = {
  currentVersion: '0.1.0',
  stage: { kind: 'available', version: '0.2.0', installBlocker: null },
};
const EXPECTED: RevertExpectation = { historyLength: 4, at: '2026-11-16 09:30', text: 'Moved from To do to Done' };
const NEW_TASK: NewTaskInput = {
  title: 'A',
  status: 'To do',
  project: null,
  due: null,
  description: '',
};

function fakeDependencies(overrides: Partial<InvokeHandlerDependencies> = {}) {
  const board = {
    snapshot: vi.fn(() => SNAPSHOT),
    createTask: vi.fn(async () => TASK),
    editTask: vi.fn(async () => TASK),
    addComment: vi.fn(async () => TASK),
    moveTask: vi.fn(async () => TASK),
    archiveTask: vi.fn(async () => TASK),
    archiveAllDone: vi.fn(async () => 2),
    restoreTask: vi.fn(async () => TASK),
    revertTask: vi.fn(async () => TASK),
    deleteTask: vi.fn(async () => undefined),
    absolutePath: vi.fn((id: string) => `/Vault/Board/${id}`),
  };
  const setup = {
    getAppState: vi.fn(async () => ({ kind: 'needsSetup' as const })),
    choose: vi.fn(async (folder: string) => ({ kind: 'rejected' as const, path: folder, message: 'No' })),
    confirm: vi.fn(async (folder: string) => ({ kind: 'rejected' as const, path: folder, message: 'No' })),
    retry: vi.fn(async () => ({ kind: 'needsSetup' as const })),
  };
  const platform = {
    preferences: vi.fn(() => ({ openAtLogin: true, notificationsAvailable: null })),
    setOpenAtLogin: vi.fn(async (enabled: boolean) => ({ openAtLogin: enabled, notificationsAvailable: null })),
    reminderBanner: vi.fn(() => []),
    dismissReminderBanner: vi.fn(() => undefined),
  };
  const appUpdates = {
    status: vi.fn(() => UPDATE_STATUS),
    onChange: vi.fn(() => () => undefined),
    check: vi.fn(async () => UPDATE_STATUS),
    install: vi.fn(async () => undefined),
    openReleasePage: vi.fn(async () => undefined),
  };
  const settingsRequests = { take: vi.fn(() => true) };
  const dependencies: InvokeHandlerDependencies = {
    board: board as unknown as BoardService,
    setup: setup as unknown as BoardSetupService,
    platform,
    appUpdates,
    settingsRequests,
    pickBoardFolder: vi.fn(async () => '/Vault/Board'),
    openInObsidian: vi.fn(async () => undefined),
    ...overrides,
  };
  return { dependencies, board, setup, platform, appUpdates, settingsRequests };
}

describe('createInvokeHandlers', () => {
  it('has a handler for every invoke method in the contract', () => {
    const handlers = createInvokeHandlers(fakeDependencies().dependencies);
    expect(Object.keys(handlers).sort()).toEqual(Object.keys(IPC.invoke).sort());
  });

  it('passes validated arguments through to the board', async () => {
    const { dependencies, board } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);

    await expect(handlers.createTask(NEW_TASK)).resolves.toBe(TASK);
    await handlers.editTask('tasks/A.md', { field: 'project', value: null });
    await handlers.moveTask('tasks/A.md', 'Done', null);
    await expect(handlers.archiveAllDone()).resolves.toBe(2);
    await expect(handlers.getSnapshot()).resolves.toBe(SNAPSHOT);
    await handlers.revertTask('tasks/A.md', 2, EXPECTED);

    expect(board.createTask).toHaveBeenCalledWith(NEW_TASK);
    expect(board.editTask).toHaveBeenCalledWith('tasks/A.md', { field: 'project', value: null });
    expect(board.moveTask).toHaveBeenCalledWith('tasks/A.md', 'Done', null);
    expect(board.revertTask).toHaveBeenCalledWith('tasks/A.md', 2, EXPECTED);
  });

  it('accepts every column, including Internal and With client', async () => {
    const { dependencies, board } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);

    for (const status of ['To do', 'In progress', 'Internal', 'With client', 'Done'] as const) {
      await handlers.createTask({ ...NEW_TASK, status });
      await handlers.moveTask('tasks/A.md', status, null);
      expect(board.createTask).toHaveBeenLastCalledWith({ ...NEW_TASK, status });
      expect(board.moveTask).toHaveBeenLastCalledWith('tasks/A.md', status, null);
    }
  });

  it.each([
    ['createTask with a missing field', 'createTask', [{ title: 'A' }]],
    ['createTask with an extra field', 'createTask', [{ ...NEW_TASK, order: 1 }]],
    ['createTask with an unknown column', 'createTask', [{ ...NEW_TASK, status: 'Blocked' }]],
    ['createTask with a responsibility', 'createTask', [{ ...NEW_TASK, responsibility: 'Client' }]],
    [
      'editTask of the removed responsibility',
      'editTask',
      ['tasks/A.md', { field: 'responsibility', value: 'Client' }],
    ],
    ['moveTask to a column in another case', 'moveTask', ['tasks/A.md', 'with client', null]],
    ['editTask with an unknown field', 'editTask', ['tasks/A.md', { field: 'status', value: 'Done' }]],
    ['editTask with a wrongly typed value', 'editTask', ['tasks/A.md', { field: 'title', value: 7 }]],
    ['moveTask with a numeric neighbour', 'moveTask', ['tasks/A.md', 'Done', 3]],
    ['addComment without text', 'addComment', ['tasks/A.md']],
    ['deleteTask with an object id', 'deleteTask', [{ id: 'tasks/A.md' }]],
    ['setOpenAtLogin with text', 'setOpenAtLogin', ['yes']],
    ['getSnapshot with an argument', 'getSnapshot', [1]],
    ['installAppUpdate with a version', 'installAppUpdate', ['0.2.0']],
    ['openAppUpdateReleasePage with a URL', 'openAppUpdateReleasePage', ['https://example.com']],
    ['checkForAppUpdate with an argument', 'checkForAppUpdate', [true]],
    ['revertTask without an expectation', 'revertTask', ['tasks/A.md', 2]],
    ['revertTask with a negative entry index', 'revertTask', ['tasks/A.md', -1, EXPECTED]],
    ['revertTask with a fractional entry index', 'revertTask', ['tasks/A.md', 1.5, EXPECTED]],
    ['revertTask with an entry index as text', 'revertTask', ['tasks/A.md', '2', EXPECTED]],
    ['revertTask with an extra expectation key', 'revertTask', ['tasks/A.md', 2, { ...EXPECTED, ledger: {} }]],
    ['revertTask with a missing expectation key', 'revertTask', ['tasks/A.md', 2, { historyLength: 4, at: '' }]],
    [
      'revertTask with a wrongly typed history length',
      'revertTask',
      ['tasks/A.md', 2, { ...EXPECTED, historyLength: '4' }],
    ],
    ['revertTask with a wrongly typed entry text', 'revertTask', ['tasks/A.md', 2, { ...EXPECTED, text: null }]],
  ] as const)('rejects %s before it reaches a service', async (_description, method, args) => {
    const { dependencies, board, platform, appUpdates } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);

    await expect((handlers[method] as (...values: unknown[]) => Promise<unknown>)(...args)).rejects.toThrow(
      /^That request wasn't valid: /,
    );
    for (const spy of [...Object.values(board), ...Object.values(platform), ...Object.values(appUpdates)]) {
      if (spy !== board.snapshot) expect(spy).not.toHaveBeenCalled();
    }
  });

  it('turns file system errors into plain words without paths', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = Object.assign(new Error("EACCES: permission denied, open '/Vault/Board/tasks/A.md'"), {
      code: 'EACCES',
    });
    const { dependencies, board } = fakeDependencies();
    board.addComment.mockRejectedValueOnce(failure);

    await expect(createInvokeHandlers(dependencies).addComment('tasks/A.md', 'Hi')).rejects.toThrow(
      "mboard doesn't have permission to change files in the board folder.",
    );
  });

  it('answers a cancelled folder picker without choosing anything', async () => {
    const { dependencies, setup } = fakeDependencies({ pickBoardFolder: async () => null });

    await expect(createInvokeHandlers(dependencies).chooseBoardFolder()).resolves.toEqual({ kind: 'cancelled' });
    expect(setup.choose).not.toHaveBeenCalled();
  });

  it('passes app update commands and the Settings request through', async () => {
    const { dependencies, appUpdates, settingsRequests } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);

    await expect(handlers.getAppUpdateStatus()).resolves.toBe(UPDATE_STATUS);
    await expect(handlers.checkForAppUpdate()).resolves.toBe(UPDATE_STATUS);
    await handlers.installAppUpdate();
    await handlers.openAppUpdateReleasePage();
    await expect(handlers.takeOpenSettingsRequest()).resolves.toBe(true);

    expect(appUpdates.check).toHaveBeenCalledOnce();
    expect(appUpdates.install).toHaveBeenCalledOnce();
    expect(appUpdates.openReleasePage).toHaveBeenCalledOnce();
    expect(settingsRequests.take).toHaveBeenCalledOnce();
  });

  it('rejects an install that cannot run with its own message', async () => {
    const { dependencies, appUpdates } = fakeDependencies();
    appUpdates.install.mockRejectedValueOnce(new Error("There's no new version to install. Check for updates first."));

    await expect(createInvokeHandlers(dependencies).installAppUpdate()).rejects.toThrow(
      "There's no new version to install. Check for updates first.",
    );
  });

  it('opens the task file in Obsidian by its absolute path', async () => {
    const { dependencies } = fakeDependencies();
    await createInvokeHandlers(dependencies).openInObsidian('tasks/A.md');

    expect(dependencies.openInObsidian).toHaveBeenCalledWith('/Vault/Board/tasks/A.md');
  });
});
