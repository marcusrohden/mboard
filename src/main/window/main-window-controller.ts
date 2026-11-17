import { app, screen, type BrowserWindow } from 'electron';
import { IPC, type EventName, type MboardEventPayloads, type TaskId } from '../../shared/contract';
import type { RendererEventSender } from '../ipc/renderer-events';
import { createMainWindow } from '../main-window';
import type { SettingsStore, WindowBounds } from '../ports';
import type { RendererSource } from '../renderer-source';
import { DebouncedSaver } from './debounced-saver';
import { restorableBounds } from './window-bounds';

const BOUNDS_SAVE_DELAY_MS = 500;

/** What the board window needs from the rest of main. */
export interface MainWindowControllerOptions {
  rendererSource: RendererSource;
  preloadPath: string;
  settings: SettingsStore;
  /** Called whenever the window gains focus, to rescan the board. */
  onFocus(): void;
}

/**
 * Owns the single board window (spec section 6). Closing it hides it and the Dock icon while the app keeps
 * running; it is really closed only once the app is quitting. Its bounds are saved, debounced, and
 * restored next time.
 */
export class MainWindowController {
  private window: BrowserWindow | null = null;
  private opening: Promise<BrowserWindow> | null = null;
  private quitting = false;
  private readonly boundsSaver: DebouncedSaver<WindowBounds>;

  constructor(private readonly options: MainWindowControllerOptions) {
    this.boundsSaver = new DebouncedSaver(
      (windowBounds) => options.settings.update({ windowBounds }),
      BOUNDS_SAVE_DELAY_MS,
    );
  }

  /** The window, if it exists. Used to attach native dialogs as sheets. */
  current(): BrowserWindow | null {
    return this.window !== null && !this.window.isDestroyed() ? this.window : null;
  }

  /** Shows the window (creating it if needed) and the Dock icon. With a task id, asks the renderer to open it. */
  async show(taskId?: TaskId): Promise<void> {
    const window = await this.ensureWindow();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    app.dock?.show().catch((error: unknown) => console.error('mboard could not show its Dock icon:', error));
    if (taskId !== undefined) this.send('openTask', taskId);
  }

  /** Sends a push event to the renderer, if the window exists. */
  readonly send: RendererEventSender = <Event extends EventName>(event: Event, payload: MboardEventPayloads[Event]) => {
    this.current()?.webContents.send(IPC.events[event], payload);
  };

  /** From now on closing the window really closes it. Called when the app starts quitting. */
  markQuitting(): void {
    this.quitting = true;
  }

  /** Whether window bounds are still waiting to be written to settings. */
  hasUnsavedBounds(): boolean {
    return this.boundsSaver.isBusy;
  }

  /** Writes any waiting window bounds now. */
  saveBoundsNow(): Promise<void> {
    return this.boundsSaver.flush();
  }

  private ensureWindow(): Promise<BrowserWindow> {
    const existing = this.current();
    if (existing !== null) return Promise.resolve(existing);
    this.opening ??= this.openWindow().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private async openWindow(): Promise<BrowserWindow> {
    const { windowBounds } = await this.options.settings.read();
    const workAreas = screen.getAllDisplays().map((display) => display.workArea);
    const window = createMainWindow({
      preloadPath: this.options.preloadPath,
      bounds: restorableBounds(windowBounds, workAreas),
    });
    this.window = window;
    this.attachLifecycle(window);
    if (this.options.rendererSource.kind === 'dev-server') window.webContents.openDevTools();
    await window.loadURL(this.options.rendererSource.entryUrl);
    return window;
  }

  private attachLifecycle(window: BrowserWindow): void {
    window.on('close', (event) => {
      if (this.quitting) return;
      event.preventDefault();
      window.hide();
      app.dock?.hide();
    });
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    window.on('focus', () => this.options.onFocus());
    const scheduleBoundsSave = (): void => {
      if (!window.isDestroyed() && !window.isMinimized() && !window.isFullScreen()) {
        this.boundsSaver.schedule(window.getNormalBounds());
      }
    };
    window.on('resize', scheduleBoundsSave);
    window.on('move', scheduleBoundsSave);
  }
}
