/** One entry directly inside a chosen folder. */
export interface FolderEntry {
  name: string;
  isDirectory: boolean;
}

/**
 * What the platform layer observed about a chosen folder. `entries` lists everything directly inside it,
 * hidden entries included. `isInsideObsidianVault` is true when the folder, or any folder above it up to
 * `/`, holds a `.obsidian/` folder.
 */
export interface FolderProbe {
  path: string;
  entries: readonly FolderEntry[];
  isInsideObsidianVault: boolean;
}

export type FolderClassification =
  | { kind: 'rejected'; message: string }
  | { kind: 'existingBoard'; needsVaultConfirmation: boolean }
  | { kind: 'newBoard'; needsVaultConfirmation: boolean };

export const NOT_A_BOARD_MESSAGE = "This folder isn't empty and isn't an mboard board.";
export const HIDDEN_FOLDER_MESSAGE = "A hidden folder can't hold a board. Choose a folder whose name doesn't start with a dot.";
export const OBSIDIAN_INTERNAL_FOLDER_MESSAGE =
  "This folder is inside Obsidian's settings or trash folder, so it can't hold a board.";
export const VAULT_WARNING_MESSAGE =
  "This folder doesn't look like it's inside an Obsidian vault. Use it anyway?";

const TASKS_FOLDER = 'tasks';
const ICLOUD_PLACEHOLDER_SUFFIX = '.icloud';
const OBSIDIAN_INTERNAL_FOLDERS: ReadonlySet<string> = new Set(['.obsidian', '.trash']);

function pathSegments(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '');
}

function isHidden(name: string): boolean {
  return name.startsWith('.');
}

function isInsideObsidianInternalFolder(segments: readonly string[]): boolean {
  return segments.some((segment) => OBSIDIAN_INTERNAL_FOLDERS.has(segment));
}

function isEmptyForNewBoard(entries: readonly FolderEntry[]): boolean {
  const hasVisibleEntry = entries.some((entry) => !isHidden(entry.name));
  const hasICloudPlaceholder = entries.some((entry) => entry.name.endsWith(ICLOUD_PLACEHOLDER_SUFFIX));
  return !hasVisibleEntry && !hasICloudPlaceholder;
}

/**
 * Decides what to do with a folder the user chose, without touching the file system.
 *
 * Rejects hidden folders and anything inside `.obsidian/` or `.trash/`. A folder with a `tasks/`
 * subfolder is an existing board. A folder with no visible entries and no iCloud placeholder is a new
 * board. Everything else is rejected. Boards outside an Obsidian vault need the user's confirmation.
 */
export function classifyFolder(probe: FolderProbe): FolderClassification {
  const segments = pathSegments(probe.path);
  const name = segments[segments.length - 1] ?? '';
  if (isHidden(name)) return { kind: 'rejected', message: HIDDEN_FOLDER_MESSAGE };
  if (isInsideObsidianInternalFolder(segments)) {
    return { kind: 'rejected', message: OBSIDIAN_INTERNAL_FOLDER_MESSAGE };
  }
  const needsVaultConfirmation = !probe.isInsideObsidianVault;
  if (probe.entries.some((entry) => entry.isDirectory && entry.name === TASKS_FOLDER)) {
    return { kind: 'existingBoard', needsVaultConfirmation };
  }
  if (isEmptyForNewBoard(probe.entries)) return { kind: 'newBoard', needsVaultConfirmation };
  return { kind: 'rejected', message: NOT_A_BOARD_MESSAGE };
}
