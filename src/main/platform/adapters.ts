import type { TaskId } from '../../shared/contract';
import type { Clock, Notifier } from '../ports';

/** One row of the tray menu. Structurally compatible with Electron's `MenuItemConstructorOptions`. */
export interface TrayMenuItem {
  label?: string;
  type?: 'normal' | 'separator' | 'checkbox';
  checked?: boolean;
  enabled?: boolean;
  click?: () => void;
}

/** The menu-bar item: an icon, the text beside it and its menu. */
export interface TrayPort {
  setTitle(title: string): void;
  setMenu(items: readonly TrayMenuItem[]): void;
  destroy(): void;
}

/** Registers mboard to open when the user logs in. */
export interface LoginItemPort {
  setOpenAtLogin(enabled: boolean): void;
}

/** Reports the Mac waking from sleep. */
export interface PowerMonitorPort {
  onResume(listener: () => void): () => void;
}

/** Runs a function repeatedly. Replaced in tests so no real time passes. */
export interface TimerPort {
  every(intervalMs: number, callback: () => void): () => void;
}

/** Persists the set of reminder keys that have already fired. */
export interface FiredKeysStore {
  load(): Promise<Set<string>>;
  save(keys: ReadonlySet<string>): Promise<void>;
}

/** What a notifier needs from the running app: the clock for its log, and the way to open the window on a click. */
export interface NotifierContext {
  clock: Clock;
  showWindow(taskId?: TaskId): void;
}

/** Everything the platform controller needs from Electron or the file system, so the controller itself stays pure. */
export interface PlatformAdapters {
  createTray(): TrayPort;
  createNotifier(context: NotifierContext): Notifier;
  loginItem: LoginItemPort;
  powerMonitor: PowerMonitorPort;
  timers: TimerPort;
  firedKeys: FiredKeysStore;
  reportError(error: unknown): void;
}
