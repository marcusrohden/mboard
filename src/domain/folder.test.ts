import { describe, expect, it } from 'vitest';
import { HIDDEN_FOLDER_MESSAGE, NOT_A_BOARD_MESSAGE, OBSIDIAN_INTERNAL_FOLDER_MESSAGE, classifyFolder } from './folder';
import type { FolderEntry, FolderProbe } from './folder';

const file = (name: string): FolderEntry => ({ name, isDirectory: false });
const directory = (name: string): FolderEntry => ({ name, isDirectory: true });

function probe(overrides: Partial<FolderProbe> = {}): FolderProbe {
  return { path: '/Users/me/Vault/Boards/Work', entries: [], isInsideObsidianVault: true, ...overrides };
}

describe('classifyFolder', () => {
  it('opens a folder with a tasks/ subfolder as an existing board', () => {
    const entries = [directory('tasks'), directory('archive'), file('README.md')];
    expect(classifyFolder(probe({ entries }))).toEqual({ kind: 'existingBoard', needsVaultConfirmation: false });
  });

  it('opens an existing board even if it has other files', () => {
    expect(classifyFolder(probe({ entries: [directory('tasks'), file('notes.txt')] })).kind).toBe('existingBoard');
  });

  it('treats a file called tasks as not a board folder', () => {
    expect(classifyFolder(probe({ entries: [file('tasks')] }))).toEqual({
      kind: 'rejected',
      message: NOT_A_BOARD_MESSAGE,
    });
  });

  it('sets up an empty folder as a new board', () => {
    expect(classifyFolder(probe())).toEqual({ kind: 'newBoard', needsVaultConfirmation: false });
  });

  it('sets up a folder with only hidden entries as a new board', () => {
    const entries = [file('.DS_Store'), directory('.git')];
    expect(classifyFolder(probe({ entries })).kind).toBe('newBoard');
  });

  it('does not set up a folder holding an iCloud placeholder, even though it is hidden', () => {
    const entries = [file('.Note.md.icloud')];
    expect(classifyFolder(probe({ entries }))).toEqual({ kind: 'rejected', message: NOT_A_BOARD_MESSAGE });
  });

  it('rejects a folder that is not empty and is not a board', () => {
    const result = classifyFolder(probe({ entries: [file('Meeting notes.md')] }));
    expect(result).toEqual({ kind: 'rejected', message: "This folder isn't empty and isn't an mboard board." });
  });

  it('rejects a hidden folder', () => {
    expect(classifyFolder(probe({ path: '/Users/me/Vault/.hidden' }))).toEqual({
      kind: 'rejected',
      message: HIDDEN_FOLDER_MESSAGE,
    });
  });

  it.each([
    '/Users/me/Vault/.obsidian',
    '/Users/me/Vault/.obsidian/plugins',
    '/Users/me/Vault/.trash',
    '/Users/me/Vault/.trash/Old/Sub',
  ])('rejects %s', (path) => {
    expect(classifyFolder(probe({ path })).kind).toBe('rejected');
  });

  it('explains why a folder inside .obsidian is rejected', () => {
    expect(classifyFolder(probe({ path: '/Users/me/Vault/.obsidian/plugins/x' }))).toEqual({
      kind: 'rejected',
      message: OBSIDIAN_INTERNAL_FOLDER_MESSAGE,
    });
  });

  it('asks for confirmation outside a vault, for new and existing boards', () => {
    expect(classifyFolder(probe({ isInsideObsidianVault: false }))).toEqual({
      kind: 'newBoard',
      needsVaultConfirmation: true,
    });
    expect(classifyFolder(probe({ isInsideObsidianVault: false, entries: [directory('tasks')] }))).toEqual({
      kind: 'existingBoard',
      needsVaultConfirmation: true,
    });
  });

  it('does not ask about the vault when rejecting', () => {
    expect(classifyFolder(probe({ isInsideObsidianVault: false, entries: [file('x.md')] })).kind).toBe('rejected');
  });

  it('handles a trailing slash on the path', () => {
    expect(classifyFolder(probe({ path: '/Users/me/Vault/.hidden/' })).kind).toBe('rejected');
  });
});
