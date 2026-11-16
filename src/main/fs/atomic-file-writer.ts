import { open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { KeyedSerialQueue } from './serial-queue';

const TEMPORARY_SUFFIX = '.mboard-tmp';

/** The hidden temporary file a write to `targetPath` goes through: `<dir>/.<name>.mboard-tmp`. */
export function temporaryPathFor(targetPath: string): string {
  return path.join(path.dirname(targetPath), `.${path.basename(targetPath)}${TEMPORARY_SUFFIX}`);
}

/** Whether a file name belongs to a temporary file left by an atomic write. */
export function isTemporaryFileName(fileName: string): boolean {
  return fileName.startsWith('.') && fileName.endsWith(TEMPORARY_SUFFIX);
}

async function writeAndSync(filePath: string, content: string): Promise<void> {
  const handle = await open(filePath, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Writes `content` to a hidden temporary file beside `targetPath`, flushes it, then renames it over the
 * target, so readers see either the old file or the new one and never a partial write. The temporary file
 * is removed if anything fails.
 */
export async function writeFileAtomically(targetPath: string, content: string): Promise<void> {
  const temporaryPath = temporaryPathFor(targetPath);
  try {
    await writeAndSync(temporaryPath, content);
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Atomic file writes, serialised per target path so two writes to one file never interleave. */
export class AtomicFileWriter {
  private readonly queue = new KeyedSerialQueue();

  write(targetPath: string, content: string): Promise<void> {
    const key = path.resolve(targetPath);
    return this.queue.run(key, () => writeFileAtomically(key, content));
  }
}
