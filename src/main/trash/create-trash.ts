import { shell } from 'electron';
import type { LaunchConfig } from '../launch-config';
import type { Trash } from '../ports';
import { FolderTrash } from './folder-trash';

/** The macOS Trash, through Electron. */
class SystemTrash implements Trash {
  trash(absolutePath: string): Promise<void> {
    return shell.trashItem(absolutePath);
  }
}

/** The trash deleted tasks go to: the folder named by `MBOARD_TRASH_DIR` when set, otherwise the macOS Trash. */
export function createTrash(launchConfig: Pick<LaunchConfig, 'trashDirectory'>): Trash {
  return launchConfig.trashDirectory === undefined ? new SystemTrash() : new FolderTrash(launchConfig.trashDirectory);
}
