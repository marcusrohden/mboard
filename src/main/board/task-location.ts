import path from 'node:path';
import type { TaskId } from '../../shared/contract';
import { BoardMessage, boardError } from './board-messages';

/** The two folders inside a board folder that hold task files. */
export const TASK_FOLDERS = ['tasks', 'archive'] as const;

export type TaskFolder = (typeof TASK_FOLDERS)[number];

export const LIVE_FOLDER: TaskFolder = 'tasks';
export const ARCHIVE_FOLDER: TaskFolder = 'archive';

/** Where a task file sits inside the board folder. `id` is `<folder>/<fileName>`. */
export interface TaskLocation {
  readonly id: TaskId;
  readonly folder: TaskFolder;
  readonly fileName: string;
}

const TASK_ID_PATTERN = /^(tasks|archive)\/([^/\\]+\.md)$/;
const TASK_FILE_EXTENSION = '.md';

/** Whether a file name inside `tasks/` or `archive/` is a task file: a visible `*.md` file. */
export function isTaskFileName(fileName: string): boolean {
  return fileName.endsWith(TASK_FILE_EXTENSION) && !fileName.startsWith('.') && !fileName.includes('\0');
}

/** Whether a folder name is one of the board's task folders. */
export function isTaskFolder(name: string | undefined): name is TaskFolder {
  return TASK_FOLDERS.some((folder) => folder === name);
}

/** The location of `fileName` inside `folder`. */
export function locationOf(folder: TaskFolder, fileName: string): TaskLocation {
  return { id: `${folder}/${fileName}`, folder, fileName };
}

/** Whether the task at `location` is archived, which is decided by its folder alone. */
export function isArchivedLocation(location: TaskLocation): boolean {
  return location.folder === ARCHIVE_FOLDER;
}

/**
 * Reads a task id sent by the renderer. Only ids of the form `tasks/<name>.md` or `archive/<name>.md` are
 * accepted, where the name has no path separators and doesn't start with a dot.
 *
 * @throws Error with a user-presentable message for anything else.
 */
export function parseTaskId(id: unknown): TaskLocation {
  const match = typeof id === 'string' ? TASK_ID_PATTERN.exec(id) : null;
  const folder = match?.[1];
  const fileName = match?.[2];
  if (!isTaskFolder(folder) || fileName === undefined || !isTaskFileName(fileName)) {
    throw boardError(BoardMessage.invalidTaskId);
  }
  return locationOf(folder, fileName);
}

/**
 * The absolute path of a task file, checked to resolve to a file directly inside the task folder of the
 * board folder.
 *
 * @throws Error with a user-presentable message when the path would leave the board folder.
 */
export function resolveTaskPath(boardPath: string, location: TaskLocation): string {
  const filePath = path.resolve(boardPath, location.folder, location.fileName);
  if (path.relative(boardPath, filePath) !== path.join(location.folder, location.fileName)) {
    throw boardError(BoardMessage.invalidTaskId);
  }
  return filePath;
}
