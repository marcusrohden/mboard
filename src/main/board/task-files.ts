import { mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import type { TaskDocument } from '../../domain';
import { fileNameForTitle, serialiseTaskFile, uniqueFileName } from '../../domain';
import type { AtomicFileWriter } from '../fs/atomic-file-writer';
import { isFileSystemError, isNotFound } from '../fs/fs-errors';
import { BoardMessage, boardError } from './board-messages';
import { loadTaskFile } from './task-file-loader';
import {
  TASK_FOLDERS,
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

/** Where a saved task should end up. The file name is a wish: a clash adds ` 2`, ` 3` and so on. */
export interface TaskDestination {
  folder: TaskFolder;
  fileName: string;
}

/**
 * The task files of one board folder: locating, reading, creating, rewriting and moving them. Every write
 * is atomic. The board folder itself is never created; `tasks/` and `archive/` are created on demand.
 */
export class TaskFiles {
  readonly boardPath: string;

  constructor(
    boardPath: string,
    private readonly writer: AtomicFileWriter,
  ) {
    this.boardPath = path.resolve(boardPath);
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

  /** Every task file in `tasks/` and `archive/`. Missing folders hold no tasks. */
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

  /** Writes a new task file named after its title, in `folder`, under a name no other file there uses. */
  async create(folder: TaskFolder, document: TaskDocument): Promise<TaskLocation> {
    const location = await this.freeLocation({ folder, fileName: fileNameForTitle(document.title) }, null);
    await this.writer.write(this.pathOf(location), serialiseTaskFile(document));
    return location;
  }

  /**
   * Writes `document` over the file at `location`, then, when `destination` differs, renames the file there
   * under a free name. If the rename fails, the file's original text is put back.
   */
  async save(
    location: TaskLocation,
    original: ReadTaskFile,
    document: TaskDocument,
    destination: TaskDestination = location,
  ): Promise<TaskLocation> {
    await this.writer.write(this.pathOf(location), serialiseTaskFile(document));
    if (destination.folder === location.folder && destination.fileName === location.fileName) return location;
    const target = await this.freeLocation(destination, location);
    if (target.id === location.id) return location;
    try {
      await rename(this.pathOf(location), this.pathOf(target));
    } catch (error) {
      await this.restoreText(location, original.content);
      throw error;
    }
    return target;
  }

  private async restoreText(location: TaskLocation, content: string): Promise<void> {
    try {
      await this.writer.write(this.pathOf(location), content);
    } catch (error) {
      console.error(`mboard could not put back the original text of ${location.id}:`, error);
    }
  }

  private async freeLocation(destination: TaskDestination, own: TaskLocation | null): Promise<TaskLocation> {
    await this.ensureFolder(destination.folder);
    const existing = await readdir(path.join(this.boardPath, destination.folder));
    const ownFileName = own !== null && own.folder === destination.folder ? own.fileName : null;
    return locationOf(destination.folder, uniqueFileName(destination.fileName, existing, ownFileName));
  }

  private async ensureFolder(folder: TaskFolder): Promise<void> {
    try {
      await mkdir(path.join(this.boardPath, folder));
    } catch (error) {
      if (isFileSystemError(error, 'EEXIST')) return;
      if (isNotFound(error)) throw boardError(BoardMessage.boardFolderMissing);
      throw error;
    }
  }

  private async listFolderTaskFiles(folder: TaskFolder): Promise<TaskLocation[]> {
    try {
      const entries = await readdir(path.join(this.boardPath, folder), { withFileTypes: true });
      return entries
        .filter((entry) => !entry.isDirectory() && isTaskFileName(entry.name))
        .map((entry) => locationOf(folder, entry.name));
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }
}
