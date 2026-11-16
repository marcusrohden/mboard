import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { isFileSystemError } from './fs-errors';

/**
 * Creates the folder `name` directly inside `parent`, unless it already exists. The parent is never
 * created, so a missing board folder stays missing and the call fails with ENOENT.
 */
export async function createChildFolder(parent: string, name: string): Promise<void> {
  try {
    await mkdir(path.join(parent, name));
  } catch (error) {
    if (!isFileSystemError(error, 'EEXIST')) throw error;
  }
}
