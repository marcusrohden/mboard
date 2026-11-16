import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTemporaryFolder, listFilesRecursively, removeTemporaryFolder } from '../test-support/temporary-folder';
import { AtomicFileWriter, isTemporaryFileName, temporaryPathFor, writeFileAtomically } from './atomic-file-writer';

describe('atomic file writes', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await createTemporaryFolder('mboard-atomic-');
  });

  afterEach(async () => {
    await removeTemporaryFolder(folder);
  });

  it('names the temporary file as a hidden sibling of the target', () => {
    expect(temporaryPathFor('/board/tasks/Fix login.md')).toBe('/board/tasks/.Fix login.md.mboard-tmp');
    expect(isTemporaryFileName('.Fix login.md.mboard-tmp')).toBe(true);
    expect(isTemporaryFileName('Fix login.md')).toBe(false);
  });

  it('replaces the target and leaves no temporary file behind', async () => {
    const target = path.join(folder, 'note.md');
    await writeFile(target, 'old');
    await writeFileAtomically(target, 'new');
    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await listFilesRecursively(folder)).toEqual(['note.md']);
  });

  it('removes the temporary file when the write fails', async () => {
    const target = path.join(folder, 'occupied');
    await mkdir(path.join(target, 'child'), { recursive: true });
    await expect(writeFileAtomically(target, 'text')).rejects.toThrow();
    expect(await listFilesRecursively(folder)).toEqual([]);
  });

  it('serialises concurrent writes to one path so the last one queued wins', async () => {
    const writer = new AtomicFileWriter();
    const target = path.join(folder, 'note.md');
    await Promise.all(Array.from({ length: 20 }, (_, index) => writer.write(target, `version ${index}`)));
    expect(await readFile(target, 'utf8')).toBe('version 19');
    expect(await listFilesRecursively(folder)).toEqual(['note.md']);
  });
});
