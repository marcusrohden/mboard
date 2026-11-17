import path from 'node:path';
import type { TaskId } from '../../shared/contract';
import { BoardMessage, boardError } from './board-messages';

/** The two folders inside a board folder that hold task files. */
export const TASK_FOLDERS = ['tasks', 'archive'] as const;

export type TaskFolder = (typeof TASK_FOLDERS)[number];

export const LIVE_FOLDER: TaskFolder = 'tasks';
export const ARCHIVE_FOLDER: TaskFolder = 'archive';

/**
 * Where a task file sits inside the board folder: directly in a task folder, or in one project folder inside
 * it. `id` is `<folder>/<fileName>` or `<folder>/<projectFolder>/<fileName>`.
 */
export interface TaskLocation {
  readonly id: TaskId;
  readonly folder: TaskFolder;
  readonly projectFolder: string | null;
  readonly fileName: string;
}

const TASK_ID_PATTERN = /^(tasks|archive)\/(?:([^/\\]+)\/)?([^/\\]+\.md)$/;
const TASK_FILE_EXTENSION = '.md';

function isVisibleName(name: string): boolean {
  return !name.startsWith('.') && !name.includes('\0');
}

/** Whether a file name inside a task folder or a project folder is a task file: a visible `*.md` file. */
export function isTaskFileName(fileName: string): boolean {
  return fileName.endsWith(TASK_FILE_EXTENSION) && isVisibleName(fileName);
}

/** Whether a folder name inside `tasks/` or `archive/` can be a project folder: one that isn't hidden. */
export function isProjectFolderName(name: string): boolean {
  return isVisibleName(name);
}

/** Whether a folder name is one of the board's task folders. */
export function isTaskFolder(name: string | undefined): name is TaskFolder {
  return TASK_FOLDERS.some((folder) => folder === name);
}

/** The location of `fileName` inside `folder`, or inside `projectFolder` within it when that isn't `null`. */
export function locationOf(folder: TaskFolder, projectFolder: string | null, fileName: string): TaskLocation {
  const id = projectFolder === null ? `${folder}/${fileName}` : `${folder}/${projectFolder}/${fileName}`;
  return { id, folder, projectFolder, fileName };
}

/** Whether the task at `location` is archived, which is decided by its folder alone. */
export function isArchivedLocation(location: TaskLocation): boolean {
  return location.folder === ARCHIVE_FOLDER;
}

/**
 * Reads a task id sent by the renderer. Only ids of the form `tasks/<name>.md`, `archive/<name>.md`,
 * `tasks/<project>/<name>.md` and `archive/<project>/<name>.md` are accepted, where no part has a path
 * separator or starts with a dot.
 *
 * @throws Error with a user-presentable message for anything else.
 */
export function parseTaskId(id: unknown): TaskLocation {
  const match = typeof id === 'string' ? TASK_ID_PATTERN.exec(id) : null;
  const folder = match?.[1];
  const projectFolder = match?.[2] ?? null;
  const fileName = match?.[3];
  if (!isTaskFolder(folder) || fileName === undefined || !isTaskFileName(fileName)) {
    throw boardError(BoardMessage.invalidTaskId);
  }
  if (projectFolder !== null && !isProjectFolderName(projectFolder)) throw boardError(BoardMessage.invalidTaskId);
  return locationOf(folder, projectFolder, fileName);
}

/** The relative path, inside the board folder, of the folder that holds the file at `location`. */
export function containingFolderOf(location: Pick<TaskLocation, 'folder' | 'projectFolder'>): string {
  return location.projectFolder === null ? location.folder : path.join(location.folder, location.projectFolder);
}

/**
 * The absolute path of a task file, checked to resolve to a file directly inside its task folder or project
 * folder within the board folder.
 *
 * @throws Error with a user-presentable message when the path would leave the board folder.
 */
export function resolveTaskPath(boardPath: string, location: TaskLocation): string {
  const expected = path.join(containingFolderOf(location), location.fileName);
  const filePath = path.resolve(boardPath, expected);
  if (path.relative(boardPath, filePath) !== expected) throw boardError(BoardMessage.invalidTaskId);
  return filePath;
}
