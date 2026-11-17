import {
  COLUMNS,
  FIRST_ORDER,
  addComment as appendComment,
  PROJECTS_FILE_NAME,
  applyEdit,
  archiveDocument,
  canonicalProject,
  columnTasks,
  createTaskDocument,
  fileNameForTitle,
  formatLocalDate,
  formatLocalDateTime,
  isSameRevertPoint,
  isStatus,
  moveToColumn,
  normaliseProject,
  orderForInsertBefore,
  orderForTopOfColumn,
  projectSuggestions,
  restoreDocument,
  revertDocument,
  setOrder,
  type ChangeContext,
  type OrderAssignment,
  type ProjectColour,
  type ProjectsFileContent,
  type TaskDocument,
} from '../../domain';
import type {
  BoardSnapshot,
  NewTaskInput,
  RevertExpectation,
  Status,
  Task,
  TaskEdit,
  TaskId,
  UnreadableFile,
} from '../../shared/contract';
import { AtomicFileWriter } from '../fs/atomic-file-writer';
import { SerialQueue } from '../fs/serial-queue';
import type { BoardService, Clock, Trash } from '../ports';
import { userFacingMessage } from '../user-facing-error';
import { BoardMessage, boardError } from './board-messages';
import { watchBoardFolder, type BoardWatcher, type FolderWatchFactory } from './board-watcher';
import { ProjectsFile } from './projects-file';
import { TaskFileIndex, taskAt } from './task-file-index';
import { TaskFiles, type ReadTaskFile } from './task-files';
import { ARCHIVE_FOLDER, LIVE_FOLDER, isArchivedLocation, type TaskLocation } from './task-location';

/** What the board service needs from the rest of main. `watchFolder` defaults to the debounced recursive watch. */
export interface BoardServiceOptions {
  clock: Clock;
  trash: Trash;
  watchFolder?: FolderWatchFactory;
}

type ChangeListener = (snapshot: BoardSnapshot) => void;

interface OpenBoard {
  files: TaskFiles;
  index: TaskFileIndex;
  projects: ProjectsFile;
  projectSettings: ProjectsFileContent;
  watcher: BoardWatcher | null;
}

const NO_PROJECT_SETTINGS: ProjectsFileContent = { kind: 'ok', colours: {} };

function requireStatus(status: Status): Status {
  if (!isStatus(status)) throw new Error(`The column must be one of: ${COLUMNS.join(', ')}.`);
  return status;
}

function archiveAllStopped(archived: number, total: number, error: unknown): Error {
  return new Error(`Archived ${archived} of ${total} tasks, then stopped: ${userFacingMessage(error)}`);
}

/**
 * The board backend (spec sections 2 and 3). It loads every task file of the open board folder and its
 * `projects.md`, watches the folder for outside edits, and applies each command as a read-modify-write of
 * the file on disk.
 *
 * Commands, scans, `open` and `close` all run one at a time through a single queue. That serialises every
 * write to a path, and it also keeps two commands from choosing the same free file name and a slow scan
 * from overwriting the result of a write that finished while it ran. Listeners hear about every scan and
 * about every command that changed a file.
 */
export class FileBoardService implements BoardService {
  private board: OpenBoard | null = null;
  private queuedRescan: Promise<void> | null = null;
  private readonly queue = new SerialQueue();
  private readonly writer = new AtomicFileWriter();
  private readonly listeners = new Set<ChangeListener>();

  constructor(private readonly options: BoardServiceOptions) {}

  open(boardPath: string): Promise<void> {
    return this.queue.run(async () => {
      this.closeBoard();
      const files = new TaskFiles(boardPath, this.writer);
      const board: OpenBoard = {
        files,
        index: new TaskFileIndex(files),
        projects: new ProjectsFile(files.boardPath, this.writer),
        projectSettings: NO_PROJECT_SETTINGS,
        watcher: null,
      };
      this.board = board;
      board.watcher = this.startWatching(files.boardPath);
      try {
        await board.index.scan();
        await this.loadProjectSettings(board);
      } catch (error) {
        this.closeBoard();
        throw error;
      }
      this.emitChange();
    });
  }

  close(): Promise<void> {
    return this.queue.run(async () => {
      if (this.board === null) return;
      this.closeBoard();
      this.emitChange();
    });
  }

  snapshot(): BoardSnapshot {
    const now = this.options.clock.now();
    const projectSettings = this.board?.projectSettings ?? NO_PROJECT_SETTINGS;
    const unreadableProjects: UnreadableFile[] =
      projectSettings.kind === 'unreadable' ? [{ id: PROJECTS_FILE_NAME, reason: projectSettings.reason }] : [];
    return {
      tasks: [...(this.board?.index.tasks() ?? [])],
      unreadable: [...(this.board?.index.unreadable() ?? []), ...unreadableProjects],
      projectColours: projectSettings.kind === 'ok' ? { ...projectSettings.colours } : {},
      now: formatLocalDateTime(now),
      today: formatLocalDate(now),
    };
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  rescan(): Promise<void> {
    this.queuedRescan ??= this.queue.run(async () => {
      this.queuedRescan = null;
      const board = this.board;
      if (board === null) return;
      await board.index.scan();
      await this.loadProjectSettings(board);
      this.emitChange();
    });
    return this.queuedRescan;
  }

  createTask(input: NewTaskInput): Promise<Task> {
    return this.mutate(async (board) => {
      const order = orderForTopOfColumn(columnTasks(board.index.tasks(), input.status));
      const document = createTaskDocument(input, { ...this.changeContext(board), order });
      const location = await board.files.create(LIVE_FOLDER, document);
      return this.recordWrite(board, document, location);
    });
  }

  editTask(id: TaskId, edit: TaskEdit): Promise<Task> {
    return this.mutate(async (board) => {
      const location = this.locateLiveTask(board, id);
      const current = await board.files.read(location);
      const result = applyEdit(current.document, edit, this.changeContext(board));
      if (!result.changed) return taskAt(current.document, location);
      const destination =
        edit.field === 'title'
          ? { folder: location.folder, fileName: fileNameForTitle(result.document.title) }
          : location;
      const saved = await board.files.save(location, current, result.document, destination);
      return this.recordWrite(board, result.document, saved, location);
    });
  }

  addComment(id: TaskId, text: string): Promise<Task> {
    return this.mutate(async (board) => {
      const location = this.locateLiveTask(board, id);
      const current = await board.files.read(location);
      const document = appendComment(current.document, text, this.now());
      await board.files.save(location, current, document);
      return this.recordWrite(board, document, location);
    });
  }

  moveTask(id: TaskId, status: Status, beforeId: TaskId | null): Promise<Task> {
    return this.mutate(async (board) => {
      const location = this.locateLiveTask(board, id);
      const target = requireStatus(status);
      const before = this.locateNeighbour(board, beforeId, location);
      const current = await board.files.read(location);
      const placement = orderForInsertBefore(columnTasks(board.index.tasks(), target), location.id, before);
      const order =
        placement.kind === 'single'
          ? placement.order
          : await this.renumberColumn(board, placement.assignments, location);
      const result = moveToColumn(current.document, target, order, this.now());
      if (!result.changed) return taskAt(current.document, location);
      await board.files.save(location, current, result.document);
      return this.recordWrite(board, result.document, location);
    });
  }

  archiveTask(id: TaskId): Promise<Task> {
    return this.mutate(async (board) => {
      const location = board.files.locate(id);
      if (isArchivedLocation(location)) throw boardError(BoardMessage.alreadyArchived);
      return this.archive(board, location, await board.files.read(location));
    });
  }

  archiveAllDone(): Promise<number> {
    return this.mutate(async (board) => {
      const done = columnTasks(board.index.tasks(), 'Done');
      let archived = 0;
      for (const task of done) {
        const location = board.files.locate(task.id);
        const current = await board.files.tryRead(location);
        if (current === null || current.document.status !== 'Done') continue;
        try {
          await this.archive(board, location, current);
        } catch (error) {
          throw archiveAllStopped(archived, done.length, error);
        }
        archived += 1;
      }
      return archived;
    });
  }

  restoreTask(id: TaskId): Promise<Task> {
    return this.mutate(async (board) => {
      const location = board.files.locate(id);
      if (!isArchivedLocation(location)) throw boardError(BoardMessage.notArchived);
      const current = await board.files.read(location);
      const order = orderForTopOfColumn(columnTasks(board.index.tasks(), 'Done'));
      const document = restoreDocument(current.document, order, this.now());
      const destination = { folder: LIVE_FOLDER, fileName: location.fileName };
      const saved = await board.files.save(location, current, document, destination);
      return this.recordWrite(board, document, saved, location);
    });
  }

  revertTask(id: TaskId, toEntryIndex: number, expected: RevertExpectation): Promise<Task> {
    return this.mutate(async (board) => {
      const location = this.locateLiveTask(board, id);
      const current = await board.files.read(location);
      if (!isSameRevertPoint(current.document.history, toEntryIndex, expected))
        throw boardError(BoardMessage.staleRevert);
      const reverted = revertDocument(current.document, toEntryIndex, this.now());
      const document =
        reverted.status === current.document.status
          ? reverted
          : { ...reverted, order: orderForTopOfColumn(columnTasks(board.index.tasks(), reverted.status)) };
      const destination =
        document.title === current.document.title
          ? location
          : { folder: location.folder, fileName: fileNameForTitle(document.title) };
      const saved = await board.files.save(location, current, document, destination);
      return this.recordWrite(board, document, saved, location);
    });
  }

  deleteTask(id: TaskId): Promise<void> {
    return this.mutate(async (board) => {
      const location = board.files.locate(id);
      await board.files.read(location);
      await this.options.trash.trash(board.files.pathOf(location));
      await board.index.refresh(location);
    });
  }

  /**
   * Gives a project a colour in `projects.md`, or removes its colour when `colour` is `null`. The name is
   * tidied and takes the spelling the board's tasks already use. Not a task update: no task file changes.
   */
  setProjectColour(project: string, colour: ProjectColour | null): Promise<void> {
    return this.queue.run(async () => {
      const board = this.requireBoard();
      const name = normaliseProject(project);
      if (name === null) throw boardError(BoardMessage.projectNameMissing);
      await board.projects.setColour(canonicalProject(name, projectSuggestions(board.index.tasks())) ?? name, colour);
      await this.loadProjectSettings(board);
      this.emitChange();
    });
  }

  absolutePath(id: TaskId): string {
    const board = this.requireBoard();
    return board.files.pathOf(board.files.locate(id));
  }

  private mutate<T>(command: (board: OpenBoard) => Promise<T>): Promise<T> {
    return this.queue.run(async () => {
      const board = this.requireBoard();
      const revision = board.index.revision;
      try {
        return await command(board);
      } finally {
        if (board.index.revision !== revision) this.emitChange();
      }
    });
  }

  private async loadProjectSettings(board: OpenBoard): Promise<void> {
    try {
      board.projectSettings = await board.projects.read();
    } catch (error) {
      console.error('mboard could not read projects.md:', error);
      board.projectSettings = { kind: 'unreadable', reason: userFacingMessage(error) };
    }
  }

  private async archive(board: OpenBoard, location: TaskLocation, current: ReadTaskFile): Promise<Task> {
    const document = archiveDocument(current.document, this.now());
    const destination = { folder: ARCHIVE_FOLDER, fileName: location.fileName };
    const saved = await board.files.save(location, current, document, destination);
    return this.recordWrite(board, document, saved, location);
  }

  private async renumberColumn(
    board: OpenBoard,
    assignments: readonly OrderAssignment[],
    moving: TaskLocation,
  ): Promise<number> {
    for (const assignment of assignments) {
      if (assignment.id !== moving.id)
        await this.renumberNeighbour(board, board.files.locate(assignment.id), assignment.order);
    }
    return assignments.find((assignment) => assignment.id === moving.id)?.order ?? FIRST_ORDER;
  }

  private async renumberNeighbour(board: OpenBoard, location: TaskLocation, order: number): Promise<void> {
    const current = await board.files.tryRead(location);
    if (current === null) return;
    const result = setOrder(current.document, order);
    if (!result.changed) return;
    await board.files.save(location, current, result.document);
    await board.index.refresh(location);
  }

  private async recordWrite(
    board: OpenBoard,
    document: TaskDocument,
    saved: TaskLocation,
    previous: TaskLocation = saved,
  ): Promise<Task> {
    await board.index.refresh(saved);
    if (previous.id !== saved.id) await board.index.refresh(previous);
    return taskAt(document, saved);
  }

  private locateLiveTask(board: OpenBoard, id: TaskId): TaskLocation {
    const location = board.files.locate(id);
    if (isArchivedLocation(location)) throw boardError(BoardMessage.archivedReadOnly);
    return location;
  }

  private locateNeighbour(board: OpenBoard, beforeId: TaskId | null, moving: TaskLocation): TaskId | null {
    if (beforeId === null) return null;
    const before = board.files.locate(beforeId);
    if (before.id === moving.id) throw boardError(BoardMessage.placedBeforeItself);
    return before.id;
  }

  private changeContext(board: OpenBoard): ChangeContext {
    return { now: this.now(), knownProjects: projectSuggestions(board.index.tasks()) };
  }

  private now(): Date {
    return this.options.clock.now();
  }

  private requireBoard(): OpenBoard {
    if (this.board === null) throw boardError(BoardMessage.noBoardOpen);
    return this.board;
  }

  private startWatching(boardPath: string): BoardWatcher | null {
    try {
      const watchFolder = this.options.watchFolder ?? watchBoardFolder;
      return watchFolder(boardPath, () => this.rescanInBackground());
    } catch (error) {
      console.error(`mboard can't watch ${boardPath}, so outside edits show only when the window gains focus:`, error);
      return null;
    }
  }

  private rescanInBackground(): void {
    this.rescan().catch((error: unknown) => console.error('mboard could not rescan the board:', error));
  }

  private closeBoard(): void {
    this.board?.watcher?.close();
    this.board = null;
  }

  private emitChange(): void {
    const snapshot = this.snapshot();
    for (const listener of [...this.listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('A board change listener failed:', error);
      }
    }
  }
}
