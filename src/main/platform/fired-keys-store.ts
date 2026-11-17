import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FiredKeysStore } from './adapters';

export const REMINDERS_FILE_NAME = 'reminders.json';

/**
 * Keeps fired reminder keys in `reminders.json`. A missing, unreadable or malformed file reads as "nothing
 * has fired". Writes go to a temporary file first and are renamed into place, so a crash never leaves half a file.
 */
export function createFileFiredKeysStore(userDataPath: string): FiredKeysStore {
  const filePath = path.join(userDataPath, REMINDERS_FILE_NAME);
  return {
    load: () => readFiredKeys(filePath),
    save: (keys) => writeFiredKeys(filePath, keys),
  };
}

async function readFiredKeys(filePath: string): Promise<Set<string>> {
  try {
    return parseFiredKeys(JSON.parse(await readFile(filePath, 'utf8')));
  } catch {
    return new Set();
  }
}

function parseFiredKeys(parsed: unknown): Set<string> {
  const keys = (parsed as { firedKeys?: unknown } | null)?.firedKeys;
  if (!Array.isArray(keys)) {
    return new Set();
  }
  return new Set(keys.filter((key): key is string => typeof key === 'string'));
}

async function writeFiredKeys(filePath: string, keys: ReadonlySet<string>): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  const contents = `${JSON.stringify({ firedKeys: [...keys].sort() }, null, 2)}\n`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, filePath);
}
