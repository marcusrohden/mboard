import { stat } from 'node:fs/promises';
import path from 'node:path';

const OBSIDIAN_CONFIG_FOLDER = '.obsidian';

async function isDirectory(folderPath: string): Promise<boolean> {
  try {
    return (await stat(folderPath)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The root of the Obsidian vault that holds `folderPath`: the nearest folder, `folderPath` itself or one above
 * it up to `/`, that holds an `.obsidian/` folder. `null` when no folder does.
 */
export async function findVaultRoot(folderPath: string): Promise<string | null> {
  for (let folder = path.resolve(folderPath); ; folder = path.dirname(folder)) {
    if (await isDirectory(path.join(folder, OBSIDIAN_CONFIG_FOLDER))) return folder;
    if (path.dirname(folder) === folder) return null;
  }
}

/**
 * The board folder's path inside its vault, with `/` separators and empty when the board folder is the vault
 * itself, or `null` when the board isn't inside a vault.
 */
export async function pathInsideVault(folderPath: string): Promise<string | null> {
  const vaultRoot = await findVaultRoot(folderPath);
  if (vaultRoot === null) return null;
  return path.relative(vaultRoot, path.resolve(folderPath)).split(path.sep).join('/');
}
