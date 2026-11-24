import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, test as base, type ElectronApplication, type Page } from '@playwright/test';
import type { Status } from '../../src/domain';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BUILT_MAIN_ENTRY = path.join(PROJECT_ROOT, '.vite', 'build', 'main.cjs');
const SEEDED_WINDOW_BOUNDS = { x: 40, y: 40, width: 1400, height: 800 };

/** A task to start the app with, written as a task file into the seeded board folder. */
export interface SeededTask {
  readonly title: string;
  readonly status: Status;
  readonly order: number;
  /** Markdown written under the file's `## Description` heading. */
  readonly description?: string;
}

/** A board folder to start the app with, holding `tasks`. */
export interface SeededBoard {
  readonly tasks: readonly SeededTask[];
}

/**
 * Fixtures for driving the built (unpackaged) app. Each test gets a fresh
 * Electron process with its own throwaway `MBOARD_USER_DATA` directory.
 */
export interface MboardFixtures {
  /** Extra environment for the app, set per file with `test.use({ launchEnv })`. */
  readonly launchEnv: Readonly<Record<string, string>>;
  /**
   * The board to start the app with, set per file with `test.use({ board })`. Given one, the app opens a fresh
   * board folder holding its tasks in a 1400 by 800 window; `null` starts it with no board folder.
   */
  readonly board: SeededBoard | null;
  readonly userDataDir: string;
  readonly electronApp: ElectronApplication;
  readonly mainWindow: Page;
}

export const test = base.extend<MboardFixtures>({
  launchEnv: [{}, { option: true }],
  board: [null, { option: true }],

  userDataDir: async ({ board }, use) => {
    const directory = await createTemporaryDirectory('mboard-e2e-user-data-');
    const boardFolder = board === null ? null : await createBoardFolder(board.tasks);
    if (boardFolder !== null) await writeSettings(directory, boardFolder);
    await use(directory);
    await rm(directory, { recursive: true, force: true });
    if (boardFolder !== null) await rm(boardFolder, { recursive: true, force: true });
  },

  electronApp: async ({ launchEnv, userDataDir }, use) => {
    assertAppIsBuilt();
    const electronApp = await electron.launch({
      executablePath: electronExecutablePath(),
      args: [PROJECT_ROOT],
      env: {
        ...inheritedEnvironment(),
        ...launchEnv,
        MBOARD_USER_DATA: userDataDir,
        MBOARD_DISABLE_APP_UPDATE_CHECK: '1',
      },
    });
    await use(electronApp);
    await electronApp.close();
  },

  mainWindow: async ({ electronApp }, use) => {
    await use(await electronApp.firstWindow());
  },
});

export { expect } from '@playwright/test';

async function createTemporaryDirectory(prefix: string): Promise<string> {
  return realpath(await mkdtemp(path.join(tmpdir(), prefix)));
}

async function createBoardFolder(tasks: readonly SeededTask[]): Promise<string> {
  const boardFolder = await createTemporaryDirectory('mboard-e2e-board-');
  const tasksFolder = path.join(boardFolder, 'tasks');
  await mkdir(tasksFolder);
  await mkdir(path.join(boardFolder, 'archive'));
  for (const task of tasks) {
    await writeFile(path.join(tasksFolder, `${task.title}.md`), taskFileContent(task));
  }
  return boardFolder;
}

function taskFileContent({ title, status, order, description }: SeededTask): string {
  const frontmatter = [
    '---',
    `title: "${title}"`,
    `status: ${status}`,
    'created: 2026-11-16T09:30:00',
    'updated: 2026-11-16T09:30:00',
    `order: ${order}`,
    '---',
    '',
  ];
  const body = description === undefined ? [] : ['## Description', '', description, ''];
  return [...frontmatter, ...body].join('\n');
}

async function writeSettings(userDataDir: string, boardFolder: string): Promise<void> {
  const settings = { boardPath: boardFolder, openAtLogin: false, windowBounds: SEEDED_WINDOW_BOUNDS };
  await writeFile(path.join(userDataDir, 'settings.json'), JSON.stringify(settings));
}

function assertAppIsBuilt(): void {
  if (!existsSync(BUILT_MAIN_ENTRY)) {
    throw new Error(
      `No built app at ${BUILT_MAIN_ENTRY}. Run "pnpm test:e2e", which packages first, or "pnpm run package" before "pnpm exec playwright test".`,
    );
  }
}

function electronExecutablePath(): string {
  return require('electron') as string;
}

function inheritedEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && name !== 'ELECTRON_RUN_AS_NODE') {
      environment[name] = value;
    }
  }
  return environment;
}
