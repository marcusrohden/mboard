import type { Dirent } from 'node:fs';
import { readdir, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import type { SerialiseOptions, TaskDocument } from '../../domain';
import { isSameFileName, serialiseTaskFile, uniqueFileName } from '../../domain';
import type { AtomicFileWriter } from '../fs/atomic-file-writer';
import { createChildFolder } from '../fs/create-child-folder';
import { isFileSystemError, isNotFound } from '../fs/fs-errors';
import { BoardMessage, boardError } from './board-messages';
import { loadTaskFile } from './task-file-loader';
import {
  TASK_FOLDERS,
  containingFolderOf,
  isProjectFolderName,
  isTaskFileName,
  locationOf,
  parseTaskId,
  resolveTaskPath,
  type TaskFolder,
  type TaskLocation,
} from './task-location';

/** A task file read for a command: the parsed document plus the exact text it was parsed from. */
export interface ReadTaskFile {
  document: TaskDocument;
  content: string;
}

/**
 * Where a saved task should end up: a task folder, the project folder inside it (`null` for none) and a file
 * name. The file name is a wish: a clash adds ` 2`, ` 3` and so on. The project folder takes the spelling of a
 * folder already there under the same name ignoring case, and is dropped when a file has that name.
 */
export interface TaskDestination {
  folder: TaskFolder;
  projectFolder: string | null;
  fileName: string;
}

type ContainingFolder = Pick<TaskLocation, 'folder' | 'projectFolder'>;

const RESPELL_SUFFIX = '.mboard-respell';

function isSameContainingFolder(a: ContainingFolder, b: ContainingFolder): boolean {
  if (a.folder !== b.folder) return false;
  if (a.projectFolder === null || b.projectFolder === null) return a.projectFolder === b.projectFolder;
  return isSameFileName(a.projectFolder, b.projectFolder);
}

function isSamePlace(location: TaskLocation, destination: TaskDestination): boolean {
  return isSameContainingFolder(location, destination) && location.fileName === destination.fileName;
}

function taskFileNamesIn(entries: readonly Dirent[]): string[] {
  return entries.filter((entry) => !entry.isDirectory() && isTaskFileName(entry.name)).map((entry) => entry.name);
}

function projectFolderNamesIn(entries: readonly Dirent[]): string[] {
  return entries.filter((entry) => entry.isDirectory() && isProjectFolderName(entry.name)).map((entry) => entry.name);
}

/**
 * The task files of one board folder: locating, reading, creating, rewriting and moving them. A task file
 * sits directly in `tasks/` or `archive/`, or in one project folder inside it. Every write is atomic. The
 * board folder itself is never created; `tasks/`, `archive/` and project folders are created on demand, and a
 * project folder a move or delete leaves empty is removed.
 */
export class TaskFiles {
  readonly boardPath: string;
  private readonly serialiseOptions: SerialiseOptions;

  /**
   * `projectNotesLinkPath` is the path, from the vault's root, of the board's projects folder, which the
   * project links in written files point into, or `null` when the board isn't inside a vault.
   */
  constructor(
    boardPath: string,
    private readonly writer: AtomicFileWriter,
    projectNotesLinkPath: string | null = null,
  ) {
    this.boardPath = path.resolve(boardPath);
    this.serialiseOptions = { projectNotesLinkPath };
  }

  /**
   * Reads a task id from the renderer as a location inside this board.
   *
   * @throws Error with a user-presentable message for an invalid or escaping id.
   */
  locate(id: unknown): TaskLocation {
    const location = parseTaskId(id);
    resolveTaskPath(this.boardPath, location);
    return location;
  }

  pathOf(location: TaskLocation): string {
    return resolveTaskPath(this.boardPath, location);
  }

  /**
   * Every task file in `tasks/` and `archive/`, and in the project folders directly inside them. Deeper
   * folders and hidden ones are not looked in. Missing folders hold no tasks.
   */
  async listTaskLocations(): Promise<TaskLocation[]> {
    const perFolder = await Promise.all(TASK_FOLDERS.map((folder) => this.listFolderTaskFiles(folder)));
    return perFolder.flat();
  }

  /**
   * Reads and parses a task file for a command.
   *
   * @throws Error with a user-presentable message when the file is gone or can't be read as a task.
   */
  async read(location: TaskLocation): Promise<ReadTaskFile> {
    const loaded = await loadTaskFile(this.pathOf(location), location.fileName);
    if (loaded.kind === 'missing') throw boardError(BoardMessage.taskMissing);
    if (loaded.kind === 'unreadable') throw boardError(BoardMessage.taskUnreadable);
    return { document: loaded.document, content: loaded.content };
  }

  /** Like `read`, but `null` when the file is gone or unreadable. */
  async tryRead(location: TaskLocation): Promise<ReadTaskFile | null> {
    const loaded = await loadTaskFile(this.pathOf(location), location.fileName);
    return loaded.kind === 'task' ? { document: loaded.document, content: loaded.content } : null;
  }

  /** Writes a new task file at `destination`, under a name no other file there uses. */
  async create(destination: TaskDestination, document: TaskDocument): Promise<TaskLocation> {
    const location = await this.freeLocation(destination, null);
    await this.writer.write(this.pathOf(location), this.serialise(document));
    return location;
  }

  /**
   * Writes `document` over the file at `location`, then, when `destination` differs, renames the file there
   * under a free name and removes a project folder the move left empty. If the rename fails, the file's
   * original text is put back.
   */
  async save(
    location: TaskLocation,
    original: ReadTaskFile,
    document: TaskDocument,
    destination: TaskDestination = location,
  ): Promise<TaskLocation> {
    await this.writer.write(this.pathOf(location), this.serialise(document));
    if (isSamePlace(location, destination)) return location;
    const target = await this.freeLocation(destination, location);
    if (target.id === location.id) return location;
    try {
      await rename(this.pathOf(location), this.pathOf(target));
    } catch (error) {
      await this.restoreText(location, original.content);
      await this.removeProjectFolderIfEmpty(target);
      throw error;
    }
    if (!isSameContainingFolder(location, target)) await this.removeProjectFolderIfEmpty(location);
    return target;
  }

  /**
   * Respells the project folder in `folder` whose name matches `spelling` ignoring case, so that it is spelt
   * exactly `spelling`. The rename goes through a hidden temporary name, because macOS volumes ignore case.
   * Returns the folder's old name, or `null` when no folder needed it.
   */
  async respellProjectFolder(folder: TaskFolder, spelling: string): Promise<string | null> {
    const parent = path.join(this.boardPath, folder);
    const entries = await this.readFolder(parent);
    const existing = entries.find((entry) => entry.isDirectory() && isSameFileName(entry.name, spelling));
    if (existing === undefined || existing.name === spelling) return null;
    const temporaryName = `.${existing.name}${RESPELL_SUFFIX}`;
    await rename(path.join(parent, existing.name), path.join(parent, temporaryName));
    try {
      await rename(path.join(parent, temporaryName), path.join(parent, spelling));
    } catch (error) {
      await rename(path.join(parent, temporaryName), path.join(parent, existing.name)).catch(() => undefined);
      throw error;
    }
    return existing.name;
  }

  /**
   * Removes the project folder that holds `location` when nothing is left in it. It never fails: a folder
   * that still holds anything, even a hidden file, stays, and any other problem is only logged.
   */
  async removeProjectFolderIfEmpty(location: ContainingFolder): Promise<void> {
    if (location.projectFolder === null) return;
    const folderPath = path.join(this.boardPath, containingFolderOf(location));
    try {
      await rmdir(folderPath);
    } catch (error) {
      if (!isFileSystemError(error, 'ENOTEMPTY', 'EEXIST', 'ENOENT', 'ENOTDIR')) {
        console.error(`mboard could not remove the empty folder ${folderPath}:`, error);
      }
    }
  }

  private serialise(document: TaskDocument): string {
    return serialiseTaskFile(document, this.serialiseOptions);
  }

  private async restoreText(location: TaskLocation, content: string): Promise<void> {
    try {
      await this.writer.write(this.pathOf(location), content);
    } catch (error) {
      console.error(`mboard could not put back the original text of ${location.id}:`, error);
    }
  }

  private async freeLocation(destination: TaskDestination, own: TaskLocation | null): Promise<TaskLocation> {
    const containing = { folder: destination.folder, projectFolder: await this.prepareFolder(destination) };
    const existing = await readdir(path.join(this.boardPath, containingFolderOf(containing)));
    const ownFileName = own !== null && isSameContainingFolder(own, containing) ? own.fileName : null;
    const fileName = uniqueFileName(destination.fileName, existing, ownFileName);
    return locationOf(containing.folder, containing.projectFolder, fileName);
  }

  /**
   * Creates the destination's task folder and project folder when missing, and returns the project folder's
   * name as it is on disk: an existing folder's spelling when only case differs, or `null` when a file
   * already has that name.
   */
  private async prepareFolder(destination: TaskDestination): Promise<string | null> {
    await this.ensureFolder(destination.folder);
    const wanted = destination.projectFolder;
    if (wanted === null) return null;
    const parent = path.join(this.boardPath, destination.folder);
    const entries = await readdir(parent, { withFileTypes: true });
    const existing = entries.find((entry) => isSameFileName(entry.name, wanted));
    if (existing === undefined) {
      await createChildFolder(parent, wanted);
      return wanted;
    }
    return existing.isDirectory() ? existing.name : null;
  }

  private async ensureFolder(folder: TaskFolder): Promise<void> {
    try {
      await createChildFolder(this.boardPath, folder);
    } catch (error) {
      if (isNotFound(error)) throw boardError(BoardMessage.boardFolderMissing);
      throw error;
    }
  }

  private async listFolderTaskFiles(folder: TaskFolder): Promise<TaskLocation[]> {
    const entries = await this.readFolder(path.join(this.boardPath, folder));
    const direct = taskFileNamesIn(entries).map((fileName) => locationOf(folder, null, fileName));
    const inProjectFolders = await Promise.all(
      projectFolderNamesIn(entries).map(async (projectFolder) => {
        const projectEntries = await this.readFolder(path.join(this.boardPath, folder, projectFolder));
        return taskFileNamesIn(projectEntries).map((fileName) => locationOf(folder, projectFolder, fileName));
      }),
    );
    return [...direct, ...inProjectFolders.flat()];
  }

  private async readFolder(folderPath: string): Promise<Dirent[]> {
    try {
      return await readdir(folderPath, { withFileTypes: true });
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }
}
