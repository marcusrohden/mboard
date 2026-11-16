import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AtomicFileWriter } from '../fs/atomic-file-writer';
import { isNotFound } from '../fs/fs-errors';
import { SerialQueue } from '../fs/serial-queue';
import type { Settings, SettingsStore, WindowBounds } from '../ports';

export const SETTINGS_FILE_NAME = 'settings.json';

/** What missing or unreadable settings read as. */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ boardPath: null, openAtLogin: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readBoardPath(value: unknown): string | null {
  return typeof value === 'string' && path.isAbsolute(value) ? value : null;
}

function readOpenAtLogin(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.openAtLogin;
}

function readWindowBounds(value: unknown): WindowBounds | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y, width, height } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

/**
 * Turns whatever `settings.json` held into valid settings. Each field that is missing or invalid falls back
 * to its default on its own, so one bad value never loses the others.
 */
export function sanitiseSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const settings: Settings = {
    boardPath: readBoardPath(source['boardPath']),
    openAtLogin: readOpenAtLogin(source['openAtLogin']),
  };
  const windowBounds = readWindowBounds(source['windowBounds']);
  if (windowBounds !== undefined) settings.windowBounds = windowBounds;
  return settings;
}

function parseSettingsText(text: string): Settings {
  try {
    return sanitiseSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Keeps the app's settings in `settings.json` inside the user-data folder. Reads always go to disk, and
 * updates are serialised read-modify-writes, written atomically.
 */
export class FileSettingsStore implements SettingsStore {
  private readonly filePath: string;
  private readonly updates = new SerialQueue();
  private readonly writer = new AtomicFileWriter();

  constructor(private readonly userDataPath: string) {
    this.filePath = path.join(userDataPath, SETTINGS_FILE_NAME);
  }

  async read(): Promise<Settings> {
    try {
      return parseSettingsText(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (isNotFound(error)) return { ...DEFAULT_SETTINGS };
      console.error('mboard could not read its settings, so it is using the defaults:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  update(patch: Partial<Settings>): Promise<Settings> {
    return this.updates.run(async () => {
      const next = sanitiseSettings({ ...(await this.read()), ...patch });
      await mkdir(this.userDataPath, { recursive: true });
      await this.writer.write(this.filePath, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }
}
