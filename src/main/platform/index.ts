import path from 'node:path';
import type { LaunchConfig } from '../launch-config';
import type { Notifier, PlatformFactory } from '../ports';
import type { NotifierContext, PlatformAdapters } from './adapters';
import { createElectronNotifier } from './electron-notifier';
import { electronLoginItem, electronPowerMonitor } from './electron-system';
import { createElectronTray } from './electron-tray';
import { createFileNotifier } from './file-notifier';
import { createFileFiredKeysStore } from './fired-keys-store';
import { createMenuBarPlatform } from './menu-bar-platform';
import { createNotificationLog, LOG_FILE_NAME } from './notification-log';
import { realTimers } from './real-timers';

function reportError(error: unknown): void {
  console.error('mboard platform error:', error);
}

function createNotifierFactory(userDataPath: string, launchConfig: LaunchConfig) {
  return (context: NotifierContext): Notifier => {
    const log = createNotificationLog({
      filePath: path.join(userDataPath, LOG_FILE_NAME),
      clock: context.clock,
      onError: reportError,
    });
    if (launchConfig.notifierLogPath !== undefined) {
      return createFileNotifier({ logPath: launchConfig.notifierLogPath, fails: launchConfig.notifierFails, log });
    }
    return createElectronNotifier(context, log);
  };
}

/**
 * Builds the menu-bar platform layer for the real app. Call `start` once Electron is ready and the board
 * service exists: it creates the tray, so it must not run before `app.whenReady()`.
 */
export const createPlatform: PlatformFactory = ({ userDataPath, launchConfig }) => {
  const adapters: PlatformAdapters = {
    createTray: createElectronTray,
    createNotifier: createNotifierFactory(userDataPath, launchConfig),
    loginItem: electronLoginItem,
    powerMonitor: electronPowerMonitor,
    timers: realTimers,
    firedKeys: createFileFiredKeysStore(userDataPath),
    reportError,
  };
  return createMenuBarPlatform({ launchConfig, adapters });
};
