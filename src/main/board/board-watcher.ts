import { realpathSync, watch, type FSWatcher } from 'node:fs';
import { PROJECTS_FILE_NAME } from '../../domain';
import { isTaskFolder } from './task-location';

/** How long the watcher waits after the last change before asking for a rescan. */
export const WATCH_DEBOUNCE_MS = 250;

/** Stops a running watch. */
export interface BoardWatcher {
  close(): void;
}

/** Starts watching a board folder, calling `onChange` when the board may have changed. */
export type FolderWatchFactory = (boardPath: string, onChange: () => void) => BoardWatcher;

/**
 * Whether a change reported at `relativePath` (relative to the board folder) can affect the board. Dot-files
 * and dot-folders anywhere in the path are ignored, as is anything outside `tasks/`, `archive/` and the
 * board's `projects.md`. A change with no path is always relevant, because the platform didn't say what
 * changed.
 */
export function isRelevantBoardChange(relativePath: string | null): boolean {
  if (relativePath === null) return true;
  const segments = relativePath.split(/[\\/]/).filter((segment) => segment !== '');
  if (segments.some((segment) => segment.startsWith('.'))) return false;
  if (segments.length === 1 && segments[0] === PROJECTS_FILE_NAME) return true;
  return isTaskFolder(segments[0]);
}

function resolveWatchRoot(boardPath: string): string {
  try {
    return realpathSync(boardPath);
  } catch {
    return boardPath;
  }
}

/**
 * Watches the board folder recursively and calls `onChange` once relevant changes have been quiet for
 * `debounceMs`. If the watch fails, for example because the folder was deleted, it stops, asks for one last
 * rescan, and leaves window-focus rescans to pick up later changes.
 */
export function watchBoardFolder(
  boardPath: string,
  onChange: () => void,
  debounceMs: number = WATCH_DEBOUNCE_MS,
): BoardWatcher {
  let timer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;

  const cancelPending = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (): void => {
    cancelPending();
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };
  const close = (): void => {
    cancelPending();
    watcher?.close();
    watcher = null;
  };

  watcher = watch(resolveWatchRoot(boardPath), { recursive: true, persistent: false }, (_event, fileName) => {
    if (isRelevantBoardChange(fileName)) schedule();
  });
  watcher.on('error', (error) => {
    console.error(`mboard stopped watching ${boardPath}:`, error);
    close();
    onChange();
  });
  return { close };
}
