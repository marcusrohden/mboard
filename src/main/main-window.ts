import { BrowserWindow } from 'electron';
import type { WindowBounds } from './ports';

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;
const MINIMUM_WIDTH = 720;
const MINIMUM_HEIGHT = 480;

/** How the board window starts. `bounds` restores a saved position and size. */
export interface MainWindowOptions {
  preloadPath: string;
  bounds?: WindowBounds;
}

/**
 * Creates the board window, hidden and not yet loaded, with Electron's secure defaults pinned explicitly.
 */
export function createMainWindow({ preloadPath, bounds }: MainWindowOptions): BrowserWindow {
  return new BrowserWindow({
    ...(bounds ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }),
    minWidth: MINIMUM_WIDTH,
    minHeight: MINIMUM_HEIGHT,
    show: false,
    title: 'mboard',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
}
