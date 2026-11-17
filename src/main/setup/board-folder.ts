import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FolderEntry, FolderProbe } from '../../domain';
import { buildBoardReadme } from '../../domain';
import type { UnavailableReason } from '../../shared/contract';
import { writeFileAtomically } from '../fs/atomic-file-writer';
import { createChildFolder } from '../fs/create-child-folder';
import { isNotFound, isPermissionDenied } from '../fs/fs-errors';

const OBSIDIAN_CONFIG_FOLDER = '.obsidian';
const README_FILE_NAME = 'README.md';
const BOARD_SUBFOLDERS = ['tasks', 'archive'] as const;

async function isDirectory(folderPath: string): Promise<boolean> {
  try {
    return (await stat(folderPath)).isDirectory();
  } catch {
    return false;
  }
}

async function toFolderEntry(parent: string, entry: Dirent): Promise<FolderEntry> {
  const isLinkedDirectory = entry.isSymbolicLink() && (await isDirectory(path.join(parent, entry.name)));
  return { name: entry.name, isDirectory: entry.isDirectory() || isLinkedDirectory };
}

/** Whether `folderPath`, or any folder above it up to `/`, holds an Obsidian `.obsidian/` folder. */
export async function isInsideObsidianVault(folderPath: string): Promise<boolean> {
  for (let folder = path.resolve(folderPath); ; folder = path.dirname(folder)) {
    if (await isDirectory(path.join(folder, OBSIDIAN_CONFIG_FOLDER))) return true;
    if (path.dirname(folder) === folder) return false;
  }
}

/**
 * Looks at a chosen folder for the domain's `classifyFolder`: everything directly inside it, hidden entries
 * included, and whether it sits inside an Obsidian vault.
 */
export async function probeFolder(folderPath: string): Promise<FolderProbe> {
  const entries = await readdir(folderPath, { withFileTypes: true });
  return {
    path: folderPath,
    entries: await Promise.all(entries.map((entry) => toFolderEntry(folderPath, entry))),
    isInsideObsidianVault: await isInsideObsidianVault(folderPath),
  };
}

/**
 * Why a board folder can't be opened, or `null` when it can: it must exist, be a folder and be readable.
 * Never creates anything.
 */
export async function checkBoardFolder(folderPath: string): Promise<UnavailableReason | null> {
  try {
    if (!(await stat(folderPath)).isDirectory()) return 'notADirectory';
    await readdir(folderPath);
    return null;
  } catch (error) {
    if (isPermissionDenied(error)) return 'permissionDenied';
    if (!isNotFound(error)) console.error(`mboard could not open the board folder ${folderPath}:`, error);
    return 'notFound';
  }
}

/**
 * Turns an empty folder into a new board: `tasks/`, `archive/` and a `README.md` describing the format. An
 * existing README is never rewritten.
 */
export async function createBoardStructure(boardPath: string): Promise<void> {
  for (const subfolder of BOARD_SUBFOLDERS) await createChildFolder(boardPath, subfolder);
  const readmePath = path.join(boardPath, README_FILE_NAME);
  try {
    await stat(readmePath);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await writeFileAtomically(readmePath, buildBoardReadme(path.basename(boardPath)));
  }
}
