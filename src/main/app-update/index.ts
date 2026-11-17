import { app, net, shell } from 'electron';
import type { LaunchConfig } from '../launch-config';
import { realCountdown, realTimers } from '../platform/real-timers';
import type { Clock } from '../ports';
import { AppUpdateService } from './app-update-service';
import { runCommand, spawnDetached } from './child-processes';
import { createGitHubReleaseSource, type Fetch } from './github-release-source';
import { createMacAppUpdateInstaller } from './mac-app-update-installer';

export interface AppUpdateServiceDependencies {
  clock: Clock;
  launchConfig: Pick<LaunchConfig, 'appUpdateCheckDisabled'>;
}

function reportError(error: unknown): void {
  console.error('mboard app update error:', error);
}

/**
 * Builds the app update service for the running app. Network access goes through Electron's `net.fetch`,
 * so it follows the system's proxy settings. Automatic checks run only in a packaged build, and never when
 * `MBOARD_DISABLE_APP_UPDATE_CHECK=1`. Call it once Electron is ready.
 */
export function createAppUpdateService({
  clock,
  launchConfig,
}: AppUpdateServiceDependencies): AppUpdateService {
  const fetch: Fetch = (url, init) => net.fetch(url, init);
  return new AppUpdateService({
    currentVersion: app.getVersion(),
    releases: createGitHubReleaseSource({ fetch, arch: process.arch }),
    installer: createMacAppUpdateInstaller({
      fetch,
      runningCopy: {
        isPackaged: app.isPackaged,
        executablePath: app.getPath('exe'),
      },
      tempFolder: app.getPath('temp'),
      processId: process.pid,
      run: runCommand,
      spawnDetached,
      reportError,
    }),
    clock,
    timers: realTimers,
    countdown: realCountdown,
    automaticChecks: app.isPackaged && !launchConfig.appUpdateCheckDisabled,
    openExternal: (url) => shell.openExternal(url),
    quit: () => app.quit(),
    reportError,
  });
}
