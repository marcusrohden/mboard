import { describe, expect, it, vi } from 'vitest';
import type {
  AgeThresholds,
  AppUpdateStatus,
  BoardSnapshot,
  NewTaskInput,
  RevertExpectation,
  Task,
} from '../../shared/contract';
import { IPC } from '../../shared/contract';
import { DEFAULT_AGENT_SETTINGS, startAgentPromptLibrary } from '../../domain';
import type { AgentPromptDraft, AgentSettings, TaskComment } from '../../shared/contract';
import type { BoardService, BoardSetupService } from '../ports';
import { createInvokeHandlers, type InvokeHandlerDependencies } from './invoke-handlers';

const SNAPSHOT: BoardSnapshot = {
  tasks: [],
  unreadable: [],
  projectColours: {},
  now: '2026-11-16T09:30:00',
  today: '2026-11-16',
};
const TASK = { id: 'tasks/A.md', title: 'A' } as Task;
const UPDATE_STATUS: AppUpdateStatus = {
  currentVersion: '0.1.0',
  stage: { kind: 'available', version: '0.2.0', installBlocker: null },
};
const THRESHOLDS: AgeThresholds = { nudgeFrom: 3, stallingFrom: 5, staleFrom: 8 };
const EXPECTED: RevertExpectation = { historyLength: 4, at: '2026-11-16 09:30', text: 'Moved from To do to Done' };
const PROMPTS = startAgentPromptLibrary('timesheet', 'List my work.', new Date(2026, 10, 23, 9, 30));
const COMMENT: TaskComment = { at: '2026-11-17 09:00', text: 'Client replied' };
const DRAFT: AgentPromptDraft = { name: 'Standup', text: 'Summarise yesterday.' };
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
    changeCommentDate: vi.fn(async () => TASK),
    moveTask: vi.fn(async () => TASK),
    archiveTask: vi.fn(async () => TASK),
    archiveAllDone: vi.fn(async () => 2),
    restoreTask: vi.fn(async () => TASK),
    revertTask: vi.fn(async () => TASK),
    deleteTask: vi.fn(async () => undefined),
    setProjectColour: vi.fn(async () => undefined),
    renameProject: vi.fn(async (_from: string, to: string) => ({ project: to, renamed: 1, moves: [] })),
    projectNotePath: vi.fn(async (project: string) => `/Vault/Board/projects/${project}.md`),
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
  const ageThresholds = {
    get: vi.fn(() => THRESHOLDS),
    set: vi.fn(async (next: AgeThresholds) => next),
  };
  const agent = {
    settings: vi.fn(async () => DEFAULT_AGENT_SETTINGS),
    saveSettings: vi.fn(async (next: AgentSettings) => next),
    open: vi.fn(async () => undefined),
    onSettingsChange: vi.fn(() => () => undefined),
  };
  const agentPrompts = {
    load: vi.fn(async () => PROMPTS),
    create: vi.fn(async () => PROMPTS),
    save: vi.fn(async () => PROMPTS),
    remove: vi.fn(async () => PROMPTS),
    select: vi.fn(async () => PROMPTS),
    promptText: vi.fn(async () => 'List my work.'),
  };
  const dependencies: InvokeHandlerDependencies = {
    board: board as unknown as BoardService,
    setup: setup as unknown as BoardSetupService,
    platform,
    ageThresholds,
    agent,
    agentPrompts,
    appUpdates,
    settingsRequests,
    pickBoardFolder: vi.fn(async () => '/Vault/Board'),
    openInObsidian: vi.fn(async () => undefined),
    openExternal: vi.fn(async () => undefined),
    ...overrides,
  };
  return { dependencies, board, setup, platform, ageThresholds, agent, agentPrompts, appUpdates, settingsRequests };
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
    await handlers.moveTask('tasks/A.md', 'Done', null, null);
    await handlers.moveTask('tasks/A.md', 'With client', 'tasks/B.md', 'Sent the quote');
    await expect(handlers.archiveAllDone()).resolves.toBe(2);
    await expect(handlers.getSnapshot()).resolves.toBe(SNAPSHOT);
    await handlers.revertTask('tasks/A.md', 2, EXPECTED);
    await handlers.changeCommentDate('tasks/A.md', COMMENT, '2026-11-16T09:00');
    await handlers.setProjectColour('Acme', 'teal');
    await handlers.setProjectColour('Acme', null);
    await expect(handlers.renameProject('Acme', 'Globex')).resolves.toEqual({
      project: 'Globex',
      renamed: 1,
      moves: [],
    });

    expect(board.createTask).toHaveBeenCalledWith(NEW_TASK);
    expect(board.editTask).toHaveBeenCalledWith('tasks/A.md', { field: 'project', value: null });
    expect(board.moveTask).toHaveBeenCalledWith('tasks/A.md', 'Done', null, null);
    expect(board.moveTask).toHaveBeenCalledWith('tasks/A.md', 'With client', 'tasks/B.md', 'Sent the quote');
    expect(board.revertTask).toHaveBeenCalledWith('tasks/A.md', 2, EXPECTED);
    expect(board.changeCommentDate).toHaveBeenCalledWith('tasks/A.md', COMMENT, '2026-11-16T09:00');
    expect(board.setProjectColour).toHaveBeenNthCalledWith(1, 'Acme', 'teal');
    expect(board.setProjectColour).toHaveBeenNthCalledWith(2, 'Acme', null);
    expect(board.renameProject).toHaveBeenCalledWith('Acme', 'Globex');
  });

  it('accepts every column, including Internal and With client', async () => {
    const { dependencies, board } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);

    for (const status of ['To do', 'In progress', 'Internal', 'With client', 'Done'] as const) {
      await handlers.createTask({ ...NEW_TASK, status });
      await handlers.moveTask('tasks/A.md', status, null, null);
      expect(board.createTask).toHaveBeenLastCalledWith({ ...NEW_TASK, status });
      expect(board.moveTask).toHaveBeenLastCalledWith('tasks/A.md', status, null, null);
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
    ['moveTask to a column in another case', 'moveTask', ['tasks/A.md', 'with client', null, null]],
    ['editTask with an unknown field', 'editTask', ['tasks/A.md', { field: 'status', value: 'Done' }]],
    ['editTask with a wrongly typed value', 'editTask', ['tasks/A.md', { field: 'title', value: 7 }]],
    ['moveTask with a numeric neighbour', 'moveTask', ['tasks/A.md', 'Done', 3, null]],
    ['moveTask without a comment argument', 'moveTask', ['tasks/A.md', 'Done', null]],
    ['moveTask with a numeric comment', 'moveTask', ['tasks/A.md', 'Done', null, 7]],
    ['addComment without text', 'addComment', ['tasks/A.md']],
    ['changeCommentDate without a date', 'changeCommentDate', ['tasks/A.md', COMMENT]],
    ['changeCommentDate with a numeric date', 'changeCommentDate', ['tasks/A.md', COMMENT, 20261116]],
    ['changeCommentDate with comment text only', 'changeCommentDate', ['tasks/A.md', 'Hi', '2026-11-16 09:00']],
    [
      'changeCommentDate with an extra comment key',
      'changeCommentDate',
      ['tasks/A.md', { ...COMMENT, ledger: {} }, '2026-11-16 09:00'],
    ],
    [
      'changeCommentDate with a wrongly typed comment time',
      'changeCommentDate',
      ['tasks/A.md', { ...COMMENT, at: null }, '2026-11-16 09:00'],
    ],
    ['deleteTask with an object id', 'deleteTask', [{ id: 'tasks/A.md' }]],
    ['setOpenAtLogin with text', 'setOpenAtLogin', ['yes']],
    ['setProjectColour with a colour outside the palette', 'setProjectColour', ['Acme', 'magenta']],
    ['setProjectColour without a colour', 'setProjectColour', ['Acme']],
    ['setProjectColour with a numeric project', 'setProjectColour', [7, 'red']],
    ['renameProject without a new name', 'renameProject', ['Acme']],
    ['renameProject with a numeric new name', 'renameProject', ['Acme', 7]],
    ['openProjectNote with an object', 'openProjectNote', [{ project: 'Acme' }]],
    ['setAgeThresholds without one threshold', 'setAgeThresholds', [{ nudgeFrom: 3, stallingFrom: 5 }]],
    ['setAgeThresholds with an extra key', 'setAgeThresholds', [{ ...THRESHOLDS, greenFrom: 0 }]],
    ['setAgentSettings without columns', 'setAgentSettings', [{ terminal: 'Ghostty', command: 'claude' }]],
    [
      'setAgentSettings with the prompt it no longer keeps',
      'setAgentSettings',
      [{ ...DEFAULT_AGENT_SETTINGS, prompt: '' }],
    ],
    ['setAgentSettings with an extra key', 'setAgentSettings', [{ ...DEFAULT_AGENT_SETTINGS, cwd: '/' }]],
    [
      'setAgentSettings with an unknown terminal',
      'setAgentSettings',
      [{ ...DEFAULT_AGENT_SETTINGS, terminal: 'xterm' }],
    ],
    ['setAgentSettings with a numeric command', 'setAgentSettings', [{ ...DEFAULT_AGENT_SETTINGS, command: 7 }]],
    ['setAgentSettings with a column as text', 'setAgentSettings', [{ ...DEFAULT_AGENT_SETTINGS, columns: 'Done' }]],
    [
      'setAgentSettings with an unknown column',
      'setAgentSettings',
      [{ ...DEFAULT_AGENT_SETTINGS, columns: ['Pending'] }],
    ],
    ['openAgent with a command for a prompt id', 'openAgent', ['rm -rf ~']],
    ['openAgent without a prompt id', 'openAgent', []],
    ['openAgent with the prompt text', 'openAgent', [{ text: 'List my work.' }]],
    ['getAgentPrompts with an argument', 'getAgentPrompts', ['timesheet']],
    ['createAgentPrompt without a draft', 'createAgentPrompt', []],
    ['createAgentPrompt with an extra key', 'createAgentPrompt', [{ ...DRAFT, id: 'mine' }]],
    ['createAgentPrompt with a numeric name', 'createAgentPrompt', [{ name: 7, text: '' }]],
    ['createAgentPrompt with far too long a prompt', 'createAgentPrompt', [{ name: 'Big', text: 'x'.repeat(30_000) }]],
    ['saveAgentPrompt without a draft', 'saveAgentPrompt', ['timesheet']],
    ['saveAgentPrompt with a path for an id', 'saveAgentPrompt', ['../settings', DRAFT]],
    ['deleteAgentPrompt with an object id', 'deleteAgentPrompt', [{ id: 'timesheet' }]],
    ['selectAgentPrompt with an empty id', 'selectAgentPrompt', ['']],
    ['getAgentSettings with an argument', 'getAgentSettings', [DEFAULT_AGENT_SETTINGS]],
    ['getAgeThresholds with an argument', 'getAgeThresholds', [THRESHOLDS]],
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
    const { dependencies, board, platform, ageThresholds, agent, agentPrompts, appUpdates } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);

    await expect((handlers[method] as (...values: unknown[]) => Promise<unknown>)(...args)).rejects.toThrow(
      /^That request wasn't valid: /,
    );
    const services = [board, platform, ageThresholds, agent, agentPrompts, appUpdates];
    for (const spy of services.flatMap((service) => Object.values(service))) {
      if (spy !== board.snapshot) expect(spy).not.toHaveBeenCalled();
    }
  });

  it('reads and saves the agent settings, and opens the agent with a saved prompt', async () => {
    const { dependencies, agent } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);
    const next: AgentSettings = { terminal: 'Terminal', command: 'claude-personal', columns: ['In progress', 'Done'] };

    await expect(handlers.getAgentSettings()).resolves.toEqual(DEFAULT_AGENT_SETTINGS);
    await expect(handlers.setAgentSettings(next)).resolves.toEqual(next);
    await handlers.openAgent('timesheet');

    expect(agent.saveSettings).toHaveBeenCalledWith(next);
    expect(agent.open).toHaveBeenCalledWith('timesheet');
  });

  it('passes saved prompts through to the prompt store', async () => {
    const { dependencies, agentPrompts } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);

    await expect(handlers.getAgentPrompts()).resolves.toBe(PROMPTS);
    await expect(handlers.createAgentPrompt(DRAFT)).resolves.toBe(PROMPTS);
    await handlers.saveAgentPrompt('timesheet', DRAFT);
    await handlers.deleteAgentPrompt('standup-1');
    await handlers.selectAgentPrompt('2f1c9a8e-5b8d-4c3a-9f1e-7a6b5c4d3e2f');

    expect(agentPrompts.create).toHaveBeenCalledWith(DRAFT);
    expect(agentPrompts.save).toHaveBeenCalledWith('timesheet', DRAFT);
    expect(agentPrompts.remove).toHaveBeenCalledWith('standup-1');
    expect(agentPrompts.select).toHaveBeenCalledWith('2f1c9a8e-5b8d-4c3a-9f1e-7a6b5c4d3e2f');
  });

  it('passes a saved prompt that cannot be saved back in plain words', async () => {
    const { dependencies, agentPrompts } = fakeDependencies();
    agentPrompts.create.mockRejectedValueOnce(new Error('There’s already a prompt called “Standup”.'));

    await expect(createInvokeHandlers(dependencies).createAgentPrompt(DRAFT)).rejects.toThrow(
      'There’s already a prompt called “Standup”.',
    );
  });

  it('rejects agent settings without a column, in plain words, without saving', async () => {
    const { dependencies, agent } = fakeDependencies();

    await expect(
      createInvokeHandlers(dependencies).setAgentSettings({ ...DEFAULT_AGENT_SETTINGS, columns: [] }),
    ).rejects.toThrow('Choose at least one column whose tasks the agent gets.');
    expect(agent.saveSettings).not.toHaveBeenCalled();
  });

  it('rejects an agent command over two lines with the reason in plain words, without saving', async () => {
    const { dependencies, agent } = fakeDependencies();

    await expect(
      createInvokeHandlers(dependencies).setAgentSettings({ ...DEFAULT_AGENT_SETTINGS, command: 'claude\ncurl evil' }),
    ).rejects.toThrow('The agent command must fit on one line.');
    expect(agent.saveSettings).not.toHaveBeenCalled();
  });

  it('reads and saves the age thresholds', async () => {
    const { dependencies, ageThresholds } = fakeDependencies();
    const handlers = createInvokeHandlers(dependencies);

    await expect(handlers.getAgeThresholds()).resolves.toEqual(THRESHOLDS);
    await expect(handlers.setAgeThresholds({ nudgeFrom: 1, stallingFrom: 2, staleFrom: 3 })).resolves.toEqual({
      nudgeFrom: 1,
      stallingFrom: 2,
      staleFrom: 3,
    });
    expect(ageThresholds.set).toHaveBeenCalledWith({ nudgeFrom: 1, stallingFrom: 2, staleFrom: 3 });
  });

  it('rejects age thresholds out of order with the reason in plain words', async () => {
    const { dependencies, ageThresholds } = fakeDependencies();

    await expect(
      createInvokeHandlers(dependencies).setAgeThresholds({ nudgeFrom: 5, stallingFrom: 4, staleFrom: 6 }),
    ).rejects.toThrow('Needs a nudge must start before Stalling, and Stalling before Stale.');
    expect(ageThresholds.set).not.toHaveBeenCalled();
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

  it.each(['https://example.com/a', 'mailto:sam@example.com', 'obsidian://open?vault=Work&file=Plan'])(
    'opens the link %s outside the app',
    async (url) => {
      const { dependencies } = fakeDependencies();
      await createInvokeHandlers(dependencies).openLink(url);

      expect(dependencies.openExternal).toHaveBeenCalledWith(url);
    },
  );

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'notes/Plan.md'])(
    'refuses to open the link %o',
    async (url) => {
      const { dependencies } = fakeDependencies();

      await expect(createInvokeHandlers(dependencies).openLink(url)).rejects.toThrow(
        'mboard only opens web, mail and Obsidian links.',
      );
      expect(dependencies.openExternal).not.toHaveBeenCalled();
    },
  );

  it("opens a project's note in Obsidian by its absolute path", async () => {
    const { dependencies } = fakeDependencies();
    await createInvokeHandlers(dependencies).openProjectNote('Acme');

    expect(dependencies.openInObsidian).toHaveBeenCalledWith('/Vault/Board/projects/Acme.md');
  });
});
