import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENT_SETTINGS, type AgentSettings } from '../../domain';
import { makeTask } from '../../domain/testHelpers';
import { FakeBoard, FakeClock, FakeSettings } from '../platform/testing/fakes';
import { createTemporaryFolder, removeTemporaryFolder } from '../test-support/temporary-folder';
import {
  AgentMessage,
  LAUNCH_FOLDER_PREFIX,
  MAX_PROMPT_BYTES,
  PROMPT_FILE_NAME,
  SCRIPT_FILE_NAME,
  TerminalAgentLauncher,
} from './agent-launcher';
import type { OpenInTerminal } from './terminal-opener';

const BOARD_PATH = '/Users/me/Vault/Board';
const NOW = '2026-11-18T10:00:00';
const AGENT: AgentSettings = {
  terminal: 'Ghostty',
  command: 'claude-personal',
  prompt: 'List my work by project.',
  columns: ['Done'],
};

const SHIPPED = makeTask({
  id: 'tasks/Acme/Shipped.md',
  title: 'Shipped',
  project: 'Acme',
  status: 'Done',
  description: 'Released v2.',
});
const ARCHIVED = makeTask({ id: 'archive/Old.md', title: 'Old', status: 'Done', isArchived: true });
const DOING = makeTask({ id: 'tasks/Doing.md', title: 'Doing', status: 'In progress' });

describe('TerminalAgentLauncher', () => {
  let temporaryFolder: string;
  let board: FakeBoard;
  let settings: FakeSettings;
  let opened: Array<{ terminal: string; scriptPath: string; script: string; prompt: string }>;
  let openInTerminal: OpenInTerminal;
  let boardPath: string | null;

  function launcher(): TerminalAgentLauncher {
    return new TerminalAgentLauncher({
      settings,
      board,
      boardPath: async () => boardPath,
      shell: '/bin/zsh',
      temporaryFolder,
      openInTerminal,
      clock: new FakeClock(NOW),
    });
  }

  async function launchFolders(): Promise<string[]> {
    return (await readdir(temporaryFolder)).filter((name) => name.startsWith(LAUNCH_FOLDER_PREFIX));
  }

  beforeEach(async () => {
    temporaryFolder = await createTemporaryFolder('mboard-agent-launcher-');
    board = new FakeBoard();
    board.tasks = [SHIPPED, ARCHIVED, DOING];
    settings = new FakeSettings({ agent: AGENT });
    boardPath = BOARD_PATH;
    opened = [];
    openInTerminal = vi.fn(async (terminal, scriptPath) => {
      const folder = path.dirname(scriptPath);
      opened.push({
        terminal,
        scriptPath,
        script: await readFile(scriptPath, 'utf8'),
        prompt: await readFile(path.join(folder, PROMPT_FILE_NAME), 'utf8'),
      });
    });
  });

  afterEach(async () => {
    await removeTemporaryFolder(temporaryFolder);
  });

  it('opens a private launch script in the chosen terminal, with the prompt and only the live tasks in Done', async () => {
    await launcher().open();

    expect(opened).toHaveLength(1);
    const [launch] = opened;
    expect(launch?.terminal).toBe('Ghostty');
    expect(path.basename(launch?.scriptPath ?? '')).toBe(SCRIPT_FILE_NAME);
    expect(launch?.prompt).toMatch(/^List my work by project\.\n\n---\n\nThe 1 task in Done/);
    expect(launch?.prompt).toContain('### Shipped');
    expect(launch?.prompt).not.toContain('Old');
    expect(launch?.prompt).not.toContain('Doing');
    expect(launch?.script).toContain(`cd '${BOARD_PATH}' || exit 1`);
    expect(launch?.script).toContain(`exec '/bin/zsh' -ilc 'claude-personal "$MBOARD_AGENT_PROMPT";`);

    const folder = path.dirname(launch?.scriptPath ?? '');
    expect((await stat(folder)).mode & 0o777).toBe(0o700);
    expect((await stat(launch?.scriptPath ?? '')).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(folder, PROMPT_FILE_NAME))).mode & 0o777).toBe(0o600);
  });

  it('hands over the tasks of every column the settings choose', async () => {
    await settings.update({ agent: { ...AGENT, columns: ['In progress', 'Done'] } });
    await launcher().open();

    expect(opened[0]?.prompt).toMatch(/The 2 tasks in In progress and Done/);
    expect(opened[0]?.prompt).toContain('### Doing');
    expect(opened[0]?.prompt).not.toContain('### Old');
  });

  it('reads the settings at every launch, so a change applies straight away', async () => {
    await launcher().open();
    await settings.update({ agent: { terminal: 'Terminal', command: 'codex', prompt: '', columns: ['Done'] } });
    await launcher().open();

    expect(opened[1]?.terminal).toBe('Terminal');
    expect(opened[1]?.script).toContain(`-ilc 'codex "$MBOARD_AGENT_PROMPT";`);
    expect(opened[1]?.prompt).toMatch(/^The 1 task in Done/);
  });

  it('removes the launch folder when the terminal fails to open, and passes the reason on', async () => {
    openInTerminal = vi.fn(async () => {
      throw new Error("mboard couldn't open Ghostty.");
    });

    await expect(launcher().open()).rejects.toThrow("mboard couldn't open Ghostty.");
    expect(await launchFolders()).toEqual([]);
  });

  it('removes launch folders an earlier terminal never ran, once they are an hour old', async () => {
    const stale = path.join(temporaryFolder, `${LAUNCH_FOLDER_PREFIX}stale`);
    const recent = path.join(temporaryFolder, `${LAUNCH_FOLDER_PREFIX}recent`);
    const unrelated = path.join(temporaryFolder, 'something-else');
    for (const folder of [stale, recent, unrelated]) await mkdir(folder);
    const twoHoursAgo = new Date(2026, 10, 18, 8, 0, 0);
    await utimes(stale, twoHoursAgo, twoHoursAgo);
    await utimes(unrelated, twoHoursAgo, twoHoursAgo);
    const tenMinutesAgo = new Date(2026, 10, 18, 9, 50, 0);
    await utimes(recent, tenMinutesAgo, tenMinutesAgo);

    await launcher().open();

    expect(existsSync(stale)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);
  });

  it.each<[string, () => void, string]>([
    ['no board is open', () => (boardPath = null), AgentMessage.noBoard],
    ['Done is empty', () => (board.tasks = [ARCHIVED, DOING]), AgentMessage.nothingInColumns(['Done'])],
    [
      'the tasks are too long to pass as one argument',
      () => (board.tasks = [{ ...SHIPPED, description: 'x'.repeat(MAX_PROMPT_BYTES) }]),
      AgentMessage.tooLong,
    ],
  ])('refuses when %s, without opening anything', async (_case, arrange, message) => {
    arrange();

    await expect(launcher().open()).rejects.toThrow(message);
    expect(openInTerminal).not.toHaveBeenCalled();
    expect(await launchFolders()).toEqual([]);
  });

  it('reads and saves the settings, trimmed, and refuses ones that cannot be saved', async () => {
    const launcherUnderTest = launcher();
    await expect(launcherUnderTest.settings()).resolves.toEqual(AGENT);

    const heard: AgentSettings[] = [];
    launcherUnderTest.onSettingsChange((saved) => heard.push(saved));
    const expected: AgentSettings = {
      terminal: 'Terminal',
      command: 'codex',
      prompt: 'Hi',
      columns: ['In progress', 'Done'],
    };

    await expect(
      launcherUnderTest.saveSettings({
        terminal: 'Terminal',
        command: '  codex  ',
        prompt: ' Hi \r\n',
        columns: ['Done', 'In progress'],
      }),
    ).resolves.toEqual(expected);
    expect(settings.value.agent).toEqual(expected);
    expect(heard).toEqual([expected]);

    await expect(launcherUnderTest.saveSettings({ ...DEFAULT_AGENT_SETTINGS, command: ' ' })).rejects.toThrow(
      /Enter the command that starts your agent/,
    );
    expect(settings.updates).toHaveLength(1);
  });
});
