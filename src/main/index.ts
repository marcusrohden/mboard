import path from 'node:path';
import { app, BrowserWindow, dialog, session } from 'electron';
import {
  registerAppSchemeAsPrivileged,
  serveRendererBundle,
} from './app-protocol';
import { registerIpcHandlers } from './ipc/register-ipc-handlers';
import { readLaunchConfig, type LaunchConfig } from './launch-config';
import { createMainWindow } from './main-window';
import { resolveRendererSource, type RendererSource } from './renderer-source';
import {
  denyPermissionRequests,
  hardenWebContents,
} from './web-contents-security';

const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
const RENDERER_BUNDLE_DIRECTORY = path.join(
  __dirname,
  '..',
  'renderer',
  MAIN_WINDOW_VITE_NAME,
);

/**
 * Configures everything that must happen before Electron is ready, then
 * starts the app once it is.
 */
function bootstrap(): void {
  try {
    applyLaunchConfig(readLaunchConfig(process.env));
    registerAppSchemeAsPrivileged();
    app.on('web-contents-created', (_event, contents) =>
      hardenWebContents(contents),
    );
    app.on('window-all-closed', keepRunningWithoutWindows);
    app.whenReady().then(startApp).catch(exitWithStartupError);
  } catch (error) {
    exitWithStartupError(error);
  }
}

function applyLaunchConfig(config: LaunchConfig): void {
  if (config.userDataPath !== undefined) {
    app.setPath('userData', config.userDataPath);
  }
}

async function startApp(): Promise<void> {
  const rendererSource = resolveRendererSource(
    MAIN_WINDOW_VITE_DEV_SERVER_URL,
    RENDERER_BUNDLE_DIRECTORY,
  );
  denyPermissionRequests(session.defaultSession);
  if (rendererSource.kind === 'bundle') {
    serveRendererBundle(rendererSource.bundleDirectory);
  }
  registerIpcHandlers(rendererSource.trustedOrigin);
  await createMainWindow(rendererSource, PRELOAD_PATH);
  app.on('activate', () => reopenMainWindow(rendererSource));
}

function reopenMainWindow(rendererSource: RendererSource): void {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(rendererSource, PRELOAD_PATH).catch(exitWithStartupError);
  }
}

/**
 * Follows the macOS convention: the app stays active in the Dock after its
 * last window closes, until the user quits with Cmd+Q.
 */
function keepRunningWithoutWindows(): void {}

function exitWithStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('mboard could not start:', error);
  dialog.showErrorBox('mboard could not start', message);
  app.exit(1);
}

bootstrap();
