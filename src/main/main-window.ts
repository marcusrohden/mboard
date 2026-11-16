import { BrowserWindow } from 'electron';
import type { RendererSource } from './renderer-source';

const WINDOW_WIDTH = 1200;
const WINDOW_HEIGHT = 800;

/**
 * Opens the board window with Electron's secure defaults pinned explicitly and
 * resolves once the renderer has loaded. DevTools open only with the dev server.
 */
export async function createMainWindow(
  rendererSource: RendererSource,
  preloadPath: string,
): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: 'mboard',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  if (rendererSource.kind === 'dev-server') {
    window.webContents.openDevTools();
  }
  await window.loadURL(rendererSource.entryUrl);
  return window;
}
