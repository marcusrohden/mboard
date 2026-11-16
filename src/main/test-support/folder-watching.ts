import { watch } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FolderWatchFactory } from '../board/board-watcher';
import { createTemporaryFolder, removeTemporaryFolder } from './temporary-folder';

const PROBE_TIMEOUT_MS = 1_500;

/** A watch factory that never reports anything, for tests that must not see watcher-driven rescans. */
export const inertFolderWatch: FolderWatchFactory = () => ({ close: () => undefined });

/**
 * Whether this environment can watch a folder recursively. Some sandboxes (for example the macOS Seatbelt
 * profile used by coding agents) block FSEvents, so `fs.watch` fails with EMFILE there. Watcher integration
 * tests skip in that case rather than report a fault that isn't in the code.
 */
export async function canWatchFoldersRecursively(): Promise<boolean> {
  const folder = await createTemporaryFolder('mboard-watch-probe-');
  try {
    await mkdir(path.join(folder, 'tasks'));
    return await new Promise<boolean>((resolve) => {
      const watcher = watch(folder, { recursive: true, persistent: false });
      const finish = (works: boolean): void => {
        clearTimeout(timer);
        watcher.close();
        resolve(works);
      };
      const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
      watcher.on('change', (_event, fileName) => {
        if (String(fileName).includes('probe.md')) finish(true);
      });
      watcher.on('error', () => finish(false));
      void writeFile(path.join(folder, 'tasks', 'probe.md'), 'probe');
    });
  } finally {
    await removeTemporaryFolder(folder);
  }
}
