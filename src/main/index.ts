import os from 'node:os';
import path from 'node:path';
import { app, dialog, session, shell } from 'electron';
import type { TaskId } from '../shared/contract';
import { TerminalAgentLauncher } from './agent/agent-launcher';
import { loginShell } from './agent/login-shell';
import { createTerminalOpener } from './agent/terminal-opener';
import { registerAppSchemeAsPrivileged, serveRendererBundle } from './app-protocol';
import { createAppUpdateService } from './app-update';
import { runCommand } from './app-update/child-processes';
import { FileBoardService } from './board/board-service';
import { createClock } from './clock';
import { createInvokeHandlers } from './ipc/invoke-handlers';
import { registerIpcHandlers } from './ipc/register-ipc-handlers';
import { bridgeRendererEvents } from './ipc/renderer-events';
import { readLaunchConfig, type LaunchConfig } from './launch-config';
import { obsidianOpenUrl } from './obsidian-link';
import { createPlatform } from './platform';
import type { BoardService } from './ports';
import { resolveRendererSource, type RendererSource } from './renderer-source';
import { StoredAgeThresholds } from './settings/age-thresholds-setting';
import { FileSettingsStore } from './settings/settings-store';
import { FileBoardSetupService } from './setup/board-setup-service';
import { MenuFolderChange } from './setup/menu-folder-change';
import { createTrash } from './trash/create-trash';
import { denyPermissionRequests, hardenWebContents } from './web-contents-security';
import { installAppMenu } from './window/app-menu';
import { MainWindowController } from './window/main-window-controller';
import { createNativeDialogs } from './window/native-dialogs';
import { SettingsRequests } from './window/settings-requests';

const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
const RENDERER_BUNDLE_DIRECTORY = path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME);

/**
 * Configures everything that must happen before Electron is ready, then starts the app once it is. The
 * single-instance lock is taken after the user-data override, because the lock lives in the user-data
 * folder.
 */
function bootstrap(): void {
  try {
    const launchConfig = readLaunchConfig(process.env);
    const rendererSource = resolveRendererSource(MAIN_WINDOW_VITE_DEV_SERVER_URL, RENDERER_BUNDLE_DIRECTORY);
    applyLaunchConfig(launchConfig);
    if (!app.requestSingleInstanceLock()) {
      app.quit();
      return;
    }
    registerAppSchemeAsPrivileged();
    app.on('web-contents-created', (_event, contents) => hardenWebContents(contents, rendererSource.trustedOrigin));
    app.on('window-all-closed', keepRunningWithoutWindows);
    app
      .whenReady()
      .then(() => startApp(launchConfig, rendererSource))
      .catch(exitWithStartupError);
  } catch (error) {
    exitWithStartupError(error);
  }
}

function applyLaunchConfig(config: LaunchConfig): void {
  if (config.userDataPath !== undefined) app.setPath('userData', config.userDataPath);
}

/**
 * The composition root: builds the clock, settings, board, setup, platform, agent launcher and app updates, wires IPC, push
 * events, the app menu and the window, then resolves the launch state before showing the window.
 */
async function startApp(launchConfig: LaunchConfig, rendererSource: RendererSource): Promise<void> {
  denyPermissionRequests(session.defaultSession);
  if (rendererSource.kind === 'bundle') serveRendererBundle(rendererSource.bundleDirectory);

  const userDataPath = app.getPath('userData');
  const clock = createClock(launchConfig);
  const settings = new FileSettingsStore(userDataPath);
  const ageThresholds = new StoredAgeThresholds(settings);
  const board = new FileBoardService({ clock, trash: createTrash(launchConfig) });
  const platform = createPlatform({ userDataPath, launchConfig });
  const appUpdates = createAppUpdateService({ clock, launchConfig });
  const setup = new FileBoardSetupService({
    settings,
    board,
    launchBoardPath: launchConfig.boardPath,
    onFirstSetup: async () => platform.setOpenAtLogin((await settings.read()).openAtLogin),
  });
  const agent = new TerminalAgentLauncher({
    settings,
    board,
    boardPath: async () => {
      const state = await setup.getAppState();
      return state.kind === 'ready' ? state.boardPath : null;
    },
    shell: loginShell(process.env['SHELL'], os.userInfo().shell),
    temporaryFolder: os.tmpdir(),
    openInTerminal: createTerminalOpener(runCommand),
    clock,
  });
  const windows = new MainWindowController({
    rendererSource,
    preloadPath: PRELOAD_PATH,
    settings,
    onFocus: () => rescanInBackground(board),
  });
  const dialogs = createNativeDialogs(() => windows.current());
  const folderChange = new MenuFolderChange(setup, dialogs, () => windows.show());
  const showWindow = (taskId?: TaskId): void => {
    windows.show(taskId).catch((error: unknown) => console.error('mboard could not show its window:', error));
  };
  const changeBoardFolder = (): void => void folderChange.run();
  const settingsRequests = new SettingsRequests(
    () => windows.show(),
    () => windows.send('openSettings', undefined),
  );
  const openSettings = (): void => {
    settingsRequests.open().catch((error: unknown) => console.error('mboard could not open Settings:', error));
  };

  registerIpcHandlers(
    rendererSource.trustedOrigin,
    createInvokeHandlers({
      setup,
      board,
      platform,
      ageThresholds,
      agent,
      appUpdates,
      settingsRequests,
      pickBoardFolder: () => dialogs.pickBoardFolder(),
      openInObsidian: (absolutePath) => shell.openExternal(obsidianOpenUrl(absolutePath)),
    }),
  );
  const stopRendererEvents = bridgeRendererEvents(
    { board, setup, platform, ageThresholds, agent, appUpdates },
    windows.send,
  );
  installAppMenu({ openSettings, changeBoardFolder });
  handleAppLifecycle(windows, showWindow, () => {
    stopRendererEvents();
    platform.stop();
    appUpdates.stop();
    void board.close();
  });

  await ageThresholds.load();
  await setup.start();
  platform.start({
    board,
    settings,
    clock,
    showWindow,
    chooseFolder: changeBoardFolder,
    openSettings,
    quit: () => app.quit(),
  });
  appUpdates.start();
  await windows.show();
}

/**
 * A second launch or a Dock click shows the window. Quitting (Cmd+Q, the menu's Quit or `quit()`) first
 * lets the window really close and finishes saving its bounds, then stops the platform and the board.
 */
function handleAppLifecycle(windows: MainWindowController, showWindow: () => void, onQuit: () => void): void {
  app.on('second-instance', () => showWindow());
  app.on('activate', () => showWindow());
  app.on('before-quit', (event) => {
    windows.markQuitting();
    if (!windows.hasUnsavedBounds()) return;
    event.preventDefault();
    void windows.saveBoundsNow().finally(() => app.quit());
  });
  app.once('will-quit', onQuit);
}

function rescanInBackground(board: BoardService): void {
  board.rescan().catch((error: unknown) => console.error('mboard could not rescan the board:', error));
}

/**
 * Follows the macOS convention for a menu-bar app: it stays running after its last window closes, until the
 * user quits.
 */
function keepRunningWithoutWindows(): void {}

function exitWithStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('mboard could not start:', error);
  dialog.showErrorBox('mboard could not start', message);
  app.exit(1);
}

bootstrap();
