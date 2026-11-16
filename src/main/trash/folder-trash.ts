import { copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { isFileSystemError } from '../fs/fs-errors';
import { SerialQueue } from '../fs/serial-queue';
import type { Trash } from '../ports';

/**
 * A free name for `fileName` among `existing`, compared ignoring case: `Note.md`, then `Note 2.md`,
 * `Note 3.md` and so on.
 */
export function freeTrashName(fileName: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.normalize('NFC').toLowerCase()));
  const extension = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  let candidate = fileName;
  for (let suffix = 2; taken.has(candidate.normalize('NFC').toLowerCase()); suffix += 1) {
    candidate = `${stem} ${suffix}${extension}`;
  }
  return candidate;
}

async function moveFile(source: string, target: string): Promise<void> {
  try {
    await rename(source, target);
  } catch (error) {
    if (!isFileSystemError(error, 'EXDEV')) throw error;
    await copyFile(source, target);
    await rm(source);
  }
}

/**
 * A trash that moves files into a plain folder, used by end-to-end tests through `MBOARD_TRASH_DIR`. A name
 * already in the folder gets a number, so nothing in it is ever overwritten.
 */
export class FolderTrash implements Trash {
  private readonly moves = new SerialQueue();

  constructor(private readonly folder: string) {}

  trash(absolutePath: string): Promise<void> {
    return this.moves.run(async () => {
      await mkdir(this.folder, { recursive: true });
      const fileName = freeTrashName(path.basename(absolutePath), await readdir(this.folder));
      await moveFile(absolutePath, path.join(this.folder, fileName));
    });
  }
}
