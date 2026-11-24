import path from 'node:path';
import {
  COLUMNS,
  FIRST_ORDER,
  addComment as appendComment,
  PROJECTS_FILE_NAME,
  applyEdit,
  archiveDocument,
  canonicalProject,
  changeCommentDate as redateComment,
  changeProjectQuietly,
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
  projectFolderName,
  projectLinkFor,
  projectNoteFileName,
  projectNotesLinkPath,
  projectSuggestions,
  resolveProjectColours,
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
  ProjectRename,
  RevertExpectation,
  Status,
  Task,
  TaskComment,
  TaskEdit,
  TaskId,
  TaskIdMove,
  UnreadableFile,
} from '../../shared/contract';
import { AtomicFileWriter } from '../fs/atomic-file-writer';
import { pathInsideVault } from '../fs/obsidian-vault';
import { SerialQueue } from '../fs/serial-queue';
import type { BoardService, Clock, Trash } from '../ports';
import { userFacingMessage } from '../user-facing-error';
import { BoardMessage, boardError } from './board-messages';
import { watchBoardFolder, type BoardWatcher, type FolderWatchFactory } from './board-watcher';
import { NO_PROJECT_NOTES, ProjectNotes, type ProjectNoteState, type ProjectNotesContent } from './project-notes';
import { ProjectsFile } from './projects-file';
import { TaskFileIndex, taskAt } from './task-file-index';
import { TaskFiles, type ReadTaskFile, type TaskDestination } from './task-files';
import {
  ARCHIVE_FOLDER,
  LIVE_FOLDER,
  TASK_FOLDERS,
  isArchivedLocation,
  locationOf,
  type TaskFolder,
  type TaskLocation,
} from './task-location';

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
  notes: ProjectNotes;
  projects: ProjectsFile;
  noteSettings: ProjectNotesContent;
  projectSettings: ProjectsFileContent;
  watcher: BoardWatcher | null;
}

/**
 * A project rename worked out before anything is written: the project's current spelling, the name it gets,
 * and whether only the case changes or it merges into another project.
 */
interface ProjectRenamePlan {
  source: string;
  target: string;
  isCaseOnly: boolean;
  isMerge: boolean;
}

type IdRelocation = (id: TaskId) => TaskId;

const NO_PROJECT_SETTINGS: ProjectsFileContent = { kind: 'ok', colours: {} };
const UNMOVED: IdRelocation = (id) => id;

function requireStatus(status: Status): Status {
  if (!isStatus(status)) throw new Error(`The column must be one of: ${COLUMNS.join(', ')}.`);
  return status;
}

/** Where an update puts a task's file: in `folder`, inside the folder of the task's project when it has one. */
function placementOf(folder: TaskFolder, document: TaskDocument, fileName: string): TaskDestination {
  return { folder, projectFolder: projectFolderName(document.project), fileName };
}

function archiveAllStopped(archived: number, total: number, error: unknown): Error {
  return new Error(`Archived ${archived} of ${total} tasks, then stopped: ${userFacingMessage(error)}`);
}

function renameStopped(renamed: number, total: number, error: unknown): Error {
  return new Error(
    `Renamed the project on ${renamed} of ${total} tasks, then stopped: ${userFacingMessage(error)} Rename it again to finish.`,
  );
}

function isSameProject(a: string | null, b: string): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase();
}

function noteColourOf(note: ProjectNoteState): ProjectColour | null {
  return note.kind === 'ok' ? note.colour : null;
}

/**
 * The board backend (spec sections 2 and 3). It loads every task file of the open board folder, its project
 * notes in `projects/` and its `projects.md`, watches the folder for outside edits, and applies each command
 * as a read-modify-write of the file on disk. Every update also puts the file in the folder of the task's
 * project (`tasks/<project>/`, or `archive/<project>/` once archived), or directly in the task folder when it
 * has none, and makes sure the project it links to has a note. Reordering neighbours in a column is not an
 * update, so it never moves their files.
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
      const files = new TaskFiles(boardPath, this.writer, projectNotesLinkPath(await pathInsideVault(boardPath)));
      const board: OpenBoard = {
        files,
        index: new TaskFileIndex(files),
        notes: new ProjectNotes(files.boardPath, this.writer, this.options.trash),
        projects: new ProjectsFile(files.boardPath, this.writer),
        noteSettings: NO_PROJECT_NOTES,
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
    const tasks = [...(this.board?.index.tasks() ?? [])];
    const projectSettings = this.board?.projectSettings ?? NO_PROJECT_SETTINGS;
    const noteSettings = this.board?.noteSettings ?? NO_PROJECT_NOTES;
    const unreadableProjects: UnreadableFile[] =
      projectSettings.kind === 'unreadable' ? [{ id: PROJECTS_FILE_NAME, reason: projectSettings.reason }] : [];
    const fileColours = projectSettings.kind === 'ok' ? projectSettings.colours : {};
    return {
      tasks,
      unreadable: [...(this.board?.index.unreadable() ?? []), ...noteSettings.unreadable, ...unreadableProjects],
      projectColours: resolveProjectColours(
        tasks.map((task) => task.project),
        noteSettings.colours,
        fileColours,
      ),
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
      const location = await board.files.create(
        placementOf(LIVE_FOLDER, document, fileNameForTitle(document.title)),
        document,
      );
      return this.recordWrite(board, document, location);
    });
  }

  /**
   * Edits one field of a live task. Of an archived task, only the project can change, and that change adds
   * a history entry without bumping date updated, so the archived task keeps its age.
   */
  editTask(id: TaskId, edit: TaskEdit): Promise<Task> {
    return this.mutate(async (board) => {
      const location = board.files.locate(id);
      const isArchived = isArchivedLocation(location);
      if (isArchived && edit.field !== 'project') throw boardError(BoardMessage.archivedReadOnly);
      const current = await board.files.read(location);
      const result =
        isArchived && edit.field === 'project'
          ? changeProjectQuietly(current.document, edit.value, this.changeContext(board), 'changed')
          : applyEdit(current.document, edit, this.changeContext(board));
      if (!result.changed) return taskAt(current.document, location);
      const fileName = edit.field === 'title' ? fileNameForTitle(result.document.title) : location.fileName;
      const destination = placementOf(location.folder, result.document, fileName);
      const saved = await board.files.save(location, current, result.document, destination);
      return this.recordWrite(board, result.document, saved, location);
    });
  }

  addComment(id: TaskId, text: string): Promise<Task> {
    return this.mutate(async (board) => {
      const location = this.locateLiveTask(board, id);
      const current = await board.files.read(location);
      const document = appendComment(current.document, text, this.now());
      const destination = placementOf(location.folder, document, location.fileName);
      const saved = await board.files.save(location, current, document, destination);
      return this.recordWrite(board, document, saved, location);
    });
  }

  /**
   * Gives a live task's comment another date. Date updated follows it only when it was the task's latest
   * comment (ADR 0015).
   */
  changeCommentDate(id: TaskId, comment: TaskComment, at: string): Promise<Task> {
    return this.mutate(async (board) => {
      const location = this.locateLiveTask(board, id);
      const current = await board.files.read(location);
      const result = redateComment(current.document, comment, at, this.now());
      if (!result.changed) return taskAt(current.document, location);
      const destination = placementOf(location.folder, result.document, location.fileName);
      const saved = await board.files.save(location, current, result.document, destination);
      return this.recordWrite(board, result.document, saved, location);
    });
  }

  moveTask(id: TaskId, status: Status, beforeId: TaskId | null, comment: string | null = null): Promise<Task> {
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
      const result = moveToColumn(current.document, target, order, this.now(), comment);
      if (!result.changed) return taskAt(current.document, location);
      const destination = placementOf(location.folder, result.document, location.fileName);
      const saved = await board.files.save(location, current, result.document, destination);
      return this.recordWrite(board, result.document, saved, location);
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
      const saved = await board.files.save(
        location,
        current,
        document,
        placementOf(LIVE_FOLDER, document, location.fileName),
      );
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
      const fileName = document.title === current.document.title ? location.fileName : fileNameForTitle(document.title);
      const saved = await board.files.save(
        location,
        current,
        document,
        placementOf(location.folder, document, fileName),
      );
      return this.recordWrite(board, document, saved, location);
    });
  }

  deleteTask(id: TaskId): Promise<void> {
    return this.mutate(async (board) => {
      const location = board.files.locate(id);
      await board.files.read(location);
      await this.options.trash.trash(board.files.pathOf(location));
      await board.files.removeProjectFolderIfEmpty(location);
      await board.index.refresh(location);
    });
  }

  /**
   * Gives a project a colour in its note, creating the note when it has none, or removes its colour when
   * `colour` is `null`. The name is tidied and takes the spelling the board's tasks already use. The project's
   * entry in `projects.md` goes, because the note's colour replaces it; a project whose name can't be a note's
   * keeps its colour in `projects.md`. Not a task update: no task file changes.
   */
  setProjectColour(project: string, colour: ProjectColour | null): Promise<void> {
    return this.queue.run(async () => {
      const board = this.requireBoard();
      const name = normaliseProject(project);
      if (name === null) throw boardError(BoardMessage.projectNameMissing);
      await this.writeColour(board, canonicalProject(name, projectSuggestions(board.index.tasks())) ?? name, colour);
      await this.loadProjectSettings(board);
      this.emitChange();
    });
  }

  /**
   * Renames a project on every task that has it, matched ignoring case, live and archived alike, and renames
   * its note, which keeps its text and colour. Each task gains a `Project renamed` history entry, but its date
   * updated stays as it was, and its file moves to the new project's folder. A new name that matches another
   * project ignoring case merges into it: that project keeps its spelling, note and colour, and the renamed
   * project's note goes to the Trash. Changing only the case of the name respells the note and the folders.
   *
   * Nothing is written when either note can't be read. Tasks are renamed one at a time; when one fails, the
   * command stops and says how far it got, and renaming again finishes the rest.
   */
  renameProject(from: string, to: string): Promise<ProjectRename> {
    return this.queue.run(async () => {
      const board = this.requireBoard();
      const plan = this.planProjectRename(board, from, to);
      if (plan.source === plan.target) return { project: plan.target, renamed: 0, moves: [] };
      try {
        await this.renameProjectNote(board, plan);
        const ids = board.index
          .tasks()
          .filter((task) => isSameProject(task.project, plan.source))
          .map((task) => task.id);
        const relocate = plan.isCaseOnly ? await this.respellProjectFolders(board, plan.target) : UNMOVED;
        return await this.renameProjectTasks(board, plan, ids, relocate);
      } finally {
        await this.loadProjectSettings(board);
        this.emitChange();
      }
    });
  }

  /**
   * The absolute path of a project's note, creating the note first when the project has none.
   *
   * @throws Error with a user-presentable message when the project's name can't be a note's.
   */
  projectNotePath(project: string): Promise<string> {
    return this.queue.run(async () => {
      const board = this.requireBoard();
      const name = normaliseProject(project);
      if (name === null) throw boardError(BoardMessage.projectNameMissing);
      const spelling = canonicalProject(name, projectSuggestions(board.index.tasks())) ?? name;
      if (projectNoteFileName(spelling) === null) throw boardError(BoardMessage.projectWithoutNote);
      await board.notes.ensure(spelling);
      const note = await board.notes.read(spelling);
      if (note.kind === 'missing') throw boardError(BoardMessage.projectWithoutNote);
      return path.join(board.notes.folderPath, note.fileName);
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
    try {
      board.noteSettings = await board.notes.readAll();
    } catch (error) {
      console.error('mboard could not read the project notes:', error);
      board.noteSettings = NO_PROJECT_NOTES;
    }
  }

  private async writeColour(board: OpenBoard, project: string, colour: ProjectColour | null): Promise<void> {
    if (projectNoteFileName(project) === null) {
      await board.projects.setColour(project, colour);
      return;
    }
    await board.notes.setColour(project, colour);
    await board.projects.removeColour(project);
  }

  private legacyColour(board: OpenBoard, project: string): ProjectColour | null {
    if (board.projectSettings.kind !== 'ok') return null;
    const entry = Object.entries(board.projectSettings.colours).find(([name]) => isSameProject(name, project));
    return entry?.[1] ?? null;
  }

  private planProjectRename(board: OpenBoard, from: string, to: string): ProjectRenamePlan {
    const sourceName = normaliseProject(from);
    if (sourceName === null) throw boardError(BoardMessage.projectToRenameMissing);
    const targetName = normaliseProject(to);
    if (targetName === null) throw boardError(BoardMessage.projectNewNameMissing);
    const known = projectSuggestions(board.index.tasks());
    const source = canonicalProject(sourceName, known) ?? sourceName;
    const isCaseOnly = isSameProject(source, targetName);
    const others = known.filter((project) => !isSameProject(project, source));
    const target = isCaseOnly ? targetName : (canonicalProject(targetName, others) ?? targetName);
    const isMerge = !isCaseOnly && others.some((project) => isSameProject(project, target));
    return { source, target, isCaseOnly, isMerge };
  }

  /**
   * Gives the target project its note and colour before any task changes, so renamed tasks link to a note
   * that exists. On a merge, an existing target note and its colour win and the source note goes to the
   * Trash; otherwise the source note is renamed. The source's `projects.md` entry goes, because its colour
   * now lives in a note.
   */
  private async renameProjectNote(board: OpenBoard, plan: ProjectRenamePlan): Promise<void> {
    const sourceNote = await board.notes.read(plan.source);
    const targetNote = plan.isCaseOnly ? sourceNote : await board.notes.read(plan.target);
    if (sourceNote.kind === 'unreadable' || targetNote.kind === 'unreadable') {
      throw boardError(BoardMessage.projectNoteUnreadable);
    }
    const sourceColour = noteColourOf(sourceNote) ?? this.legacyColour(board, plan.source);
    const targetColour = plan.isMerge ? (noteColourOf(targetNote) ?? this.legacyColour(board, plan.target)) : null;
    const sharesNote =
      sourceNote.kind === 'ok' && targetNote.kind === 'ok' && sourceNote.fileName === targetNote.fileName;
    if (plan.isMerge && targetNote.kind === 'ok' && !sharesNote) {
      if (sourceNote.kind === 'ok') await board.notes.trash(plan.source);
    } else {
      await board.notes.rename(plan.source, plan.target);
    }
    await board.projects.removeColour(plan.source);
    const colour = targetColour ?? sourceColour;
    if (colour !== null) await this.writeColour(board, plan.target, colour);
    else await board.notes.ensure(plan.target);
  }

  /**
   * Respells the project's folders in `tasks/` and `archive/` when only the case of its name changes, which
   * moving the files alone can't do on a volume that ignores case. Returns how each task id changes with
   * them.
   */
  private async respellProjectFolders(board: OpenBoard, project: string): Promise<IdRelocation> {
    const spelling = projectFolderName(project);
    if (spelling === null) return UNMOVED;
    const formerNames = new Map<TaskFolder, string>();
    for (const folder of TASK_FOLDERS) {
      const formerName = await board.files.respellProjectFolder(folder, spelling);
      if (formerName !== null) formerNames.set(folder, formerName);
    }
    if (formerNames.size === 0) return UNMOVED;
    await board.index.scan();
    return (id) => {
      const location = board.files.locate(id);
      const isRespelled =
        location.projectFolder !== null && formerNames.get(location.folder) === location.projectFolder;
      return isRespelled ? locationOf(location.folder, spelling, location.fileName).id : id;
    };
  }

  /**
   * Renames the project on each of `ids`, as they were before any folder was respelled. Each file is read
   * again first, and one whose project changed meanwhile is skipped.
   */
  private async renameProjectTasks(
    board: OpenBoard,
    plan: ProjectRenamePlan,
    ids: readonly TaskId[],
    relocate: IdRelocation,
  ): Promise<ProjectRename> {
    const context = { now: this.now(), knownProjects: [] };
    const moves: TaskIdMove[] = [];
    let renamed = 0;
    for (const originalId of ids) {
      try {
        const location = board.files.locate(relocate(originalId));
        const current = await board.files.tryRead(location);
        if (current === null || !isSameProject(current.document.project, plan.source)) continue;
        const result = changeProjectQuietly(current.document, plan.target, context, 'renamed');
        const saved = result.changed
          ? await board.files.save(
              location,
              current,
              result.document,
              placementOf(location.folder, result.document, location.fileName),
            )
          : location;
        if (result.changed) {
          await this.recordWrite(board, result.document, saved, location);
          renamed += 1;
        }
        if (saved.id !== originalId) moves.push({ from: originalId, to: saved.id });
      } catch (error) {
        throw renameStopped(renamed, ids.length, error);
      }
    }
    return { project: plan.target, renamed, moves };
  }

  private async archive(board: OpenBoard, location: TaskLocation, current: ReadTaskFile): Promise<Task> {
    const document = archiveDocument(current.document, this.now());
    const destination = placementOf(ARCHIVE_FOLDER, document, location.fileName);
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
    await this.ensureLinkedNote(board, document);
    return taskAt(document, saved);
  }

  /**
   * Creates the note a task's file now links to, when it doesn't exist yet. It never fails the update that
   * wrote the task: a note that can't be created is only logged, and the link waits for it.
   */
  private async ensureLinkedNote(board: OpenBoard, document: TaskDocument): Promise<void> {
    if (document.project === null || document.rawProject !== null) return;
    if (projectLinkFor(document.project, null) === null) return;
    try {
      await board.notes.ensure(document.project);
    } catch (error) {
      console.error(`mboard could not create the note for the project ${document.project}:`, error);
    }
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
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('A board change listener failed:', error);
      }
    }
  }
}
