import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTemporaryFolder, listFilesRecursively, removeTemporaryFolder } from '../test-support/temporary-folder';
import { FolderTrash, freeTrashName } from './folder-trash';

describe('freeTrashName', () => {
  it('keeps a free name and numbers a taken one, ignoring case', () => {
    expect(freeTrashName('Note.md', [])).toBe('Note.md');
    expect(freeTrashName('Note.md', ['note.md', 'NOTE 2.md'])).toBe('Note 3.md');
  });
});

describe('FolderTrash', () => {
  let root: string;

  beforeEach(async () => {
    root = await createTemporaryFolder('mboard-trash-');
  });

  afterEach(async () => {
    await removeTemporaryFolder(root);
  });

  it('moves files into the trash folder, creating it, and never overwrites one already there', async () => {
    const trash = new FolderTrash(path.join(root, 'trash'));
    await writeFile(path.join(root, 'Note.md'), 'first');
    await trash.trash(path.join(root, 'Note.md'));
    await writeFile(path.join(root, 'Note.md'), 'second');
    await trash.trash(path.join(root, 'Note.md'));

    expect(await listFilesRecursively(root)).toEqual(['trash/Note 2.md', 'trash/Note.md']);
    expect(await readFile(path.join(root, 'trash', 'Note.md'), 'utf8')).toBe('first');
    expect(await readFile(path.join(root, 'trash', 'Note 2.md'), 'utf8')).toBe('second');
  });
});
