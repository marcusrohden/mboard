import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Creates a fresh folder under the system temp folder for an integration test. The path is resolved
 * through symlinks, because on macOS `/var` is a link to `/private/var` and file watchers report real paths.
 */
export async function createTemporaryFolder(prefix: string): Promise<string> {
  return realpath(await mkdtemp(path.join(tmpdir(), prefix)));
}

/** Removes a folder created by `createTemporaryFolder`. */
export async function removeTemporaryFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true });
}

/** Every file path under `folder`, relative to it, with `/` separators, sorted. */
export async function listFilesRecursively(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}
