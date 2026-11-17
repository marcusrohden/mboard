import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, test as base, type ElectronApplication, type Page } from '@playwright/test';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BUILT_MAIN_ENTRY = path.join(PROJECT_ROOT, '.vite', 'build', 'main.cjs');

/**
 * Fixtures for driving the built (unpackaged) app. Each test gets a fresh
 * Electron process with its own throwaway `MBOARD_USER_DATA` directory.
 */
export interface MboardFixtures {
  /** Extra environment for the app, set per file with `test.use({ launchEnv })`. */
  readonly launchEnv: Readonly<Record<string, string>>;
  readonly userDataDir: string;
  readonly electronApp: ElectronApplication;
  readonly mainWindow: Page;
}

export const test = base.extend<MboardFixtures>({
  launchEnv: [{}, { option: true }],

  userDataDir: async ({}, use) => {
    const directory = await createTemporaryDirectory('mboard-e2e-user-data-');
    await use(directory);
    await rm(directory, { recursive: true, force: true });
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
