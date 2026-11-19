import type { Dirent } from 'node:fs';
import { readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import {
  PROJECT_NOTES_FOLDER,
  isSameFileName,
  parseProjectNote,
  projectNoteFileName,
  withNoteColour,
  withNoteHeading,
  type ProjectColour,
  type ProjectColours,
} from '../../domain';
import type { UnreadableFile } from '../../shared/contract';
import type { AtomicFileWriter } from '../fs/atomic-file-writer';
import { createChildFolder } from '../fs/create-child-folder';
import { isNotFound } from '../fs/fs-errors';
import type { Trash } from '../ports';
import { userFacingMessage } from '../user-facing-error';
import { BoardMessage, boardError } from './board-messages';
import { isTaskFileName } from './task-location';

/** A project's note as it is on disk: missing, unreadable, or readable with its text and colour. */
export type ProjectNoteState =
  | { kind: 'missing' }
  | { kind: 'unreadable'; fileName: string; reason: string }
  | { kind: 'ok'; fileName: string; content: string; colour: ProjectColour | null };

/**
 * What the projects folder holds for the board: each coloured note's colour, by the note's name without
 * `.md`, and the notes that can't be read.
 */
export interface ProjectNotesContent {
  colours: ProjectColours;
  unreadable: readonly UnreadableFile[];
}

/** No project notes: the content of a board without a projects folder. */
export const NO_PROJECT_NOTES: ProjectNotesContent = { colours: {}, unreadable: [] };
const MARKDOWN_EXTENSION = /\.md$/i;

const MISSING: ProjectNoteState = { kind: 'missing' };
const RENAME_SUFFIX = '.mboard-rename';

function noteFileNamesIn(entries: readonly Dirent[]): string[] {
  return entries.filter((entry) => entry.isFile() && isTaskFileName(entry.name)).map((entry) => entry.name);
}

/**
 * The board's project notes, one markdown file per project in the projects folder, named after the project
 * the way its task folder is. A task's `project` links to its note. mboard reads a note's `colour`, writes
 * only that and its own heading, and leaves the rest of the note to the person. Notes are found ignoring
 * case. A note that can't be read is never written. Every write is atomic, and the projects folder is
 * created on demand.
 */
export class ProjectNotes {
  readonly folderPath: string;

  constructor(
    private readonly boardPath: string,
    private readonly writer: AtomicFileWriter,
    private readonly trashCan: Trash,
  ) {
    this.folderPath = path.join(boardPath, PROJECT_NOTES_FOLDER);
  }

  /** Reads every note directly in the projects folder. A missing folder holds no notes. */
  async readAll(): Promise<ProjectNotesContent> {
    const fileNames = noteFileNamesIn(await this.readFolder());
    const notes = await Promise.all(fileNames.map((fileName) => this.load(fileName)));
    const colours: Array<[string, ProjectColour]> = [];
    const unreadable: UnreadableFile[] = [];
    for (const note of notes) {
      if (note.kind === 'unreadable') unreadable.push({ id: this.idOf(note.fileName), reason: note.reason });
      if (note.kind === 'ok' && note.colour !== null) {
        colours.push([note.fileName.replace(MARKDOWN_EXTENSION, ''), note.colour]);
      }
    }
    return { colours: Object.fromEntries(colours), unreadable };
  }

  /** The note of `project`, found ignoring case, or `missing` when it has none or can't have one. */
  async read(project: string): Promise<ProjectNoteState> {
    const fileName = await this.findFileName(project);
    return fileName === null ? MISSING : this.load(fileName);
  }

  /**
   * Gives `project`'s note the colour `colour`, or removes its colour when `colour` is `null`, creating the
   * note when it is missing and a colour is given. A project that can't have a note is left alone.
   *
   * @throws Error with a user-presentable message when the note can't be read.
   */
  async setColour(project: string, colour: ProjectColour | null): Promise<void> {
    const note = await this.read(project);
    if (note.kind === 'unreadable') throw boardError(BoardMessage.projectNoteUnreadable);
    if (note.kind === 'ok') {
      if (note.colour !== colour) await this.write(note.fileName, withNoteColour(note.content, project, colour));
      return;
    }
    if (colour !== null) await this.create(project, colour);
  }

  /** Creates `project`'s note, without a colour, when it has none yet. An existing note is never touched. */
  async ensure(project: string): Promise<void> {
    if ((await this.read(project)).kind === 'missing') await this.create(project, null);
  }

  /**
   * Moves the note of `from` to the name of `to`, keeping its text, and renames the heading mboard started it
   * with. Only the case of a name changing goes through a hidden temporary name, because macOS volumes
   * ignore case. A project without a note, or whose new name can't be a note's, is left alone.
   *
   * @throws Error with a user-presentable message when the note can't be read or another note already has
   * the new name.
   */
  async rename(from: string, to: string): Promise<void> {
    const note = await this.read(from);
    if (note.kind === 'missing') return;
    if (note.kind === 'unreadable') throw boardError(BoardMessage.projectNoteUnreadable);
    const targetFileName = projectNoteFileName(to);
    if (targetFileName === null) return;
    if (!isSameFileName(note.fileName, targetFileName)) {
      if ((await this.findFileName(to)) !== null) throw boardError(BoardMessage.projectNoteTaken);
      await rename(this.pathOf(note.fileName), this.pathOf(targetFileName));
    } else if (note.fileName !== targetFileName) {
      await this.respell(note.fileName, targetFileName);
    }
    const renamed = withNoteHeading(note.content, from, to);
    if (renamed !== note.content) await this.write(targetFileName, renamed);
  }

  /** Moves `project`'s note to the Trash, when it has one. */
  async trash(project: string): Promise<void> {
    const fileName = await this.findFileName(project);
    if (fileName !== null) await this.trashCan.trash(this.pathOf(fileName));
  }

  private async create(project: string, colour: ProjectColour | null): Promise<void> {
    const fileName = projectNoteFileName(project);
    if (fileName === null) return;
    await this.ensureFolder();
    await this.write(fileName, withNoteColour(null, project, colour));
  }

  private async respell(fileName: string, spelling: string): Promise<void> {
    const temporaryPath = this.pathOf(`.${fileName}${RENAME_SUFFIX}`);
    await rename(this.pathOf(fileName), temporaryPath);
    try {
      await rename(temporaryPath, this.pathOf(spelling));
    } catch (error) {
      await rename(temporaryPath, this.pathOf(fileName)).catch(() => undefined);
      throw error;
    }
  }

  private async findFileName(project: string): Promise<string | null> {
    const wanted = projectNoteFileName(project);
    if (wanted === null) return null;
    return noteFileNamesIn(await this.readFolder()).find((fileName) => isSameFileName(fileName, wanted)) ?? null;
  }

  private async load(fileName: string): Promise<ProjectNoteState> {
    let content: string;
    try {
      content = await readFile(this.pathOf(fileName), 'utf8');
    } catch (error) {
      if (isNotFound(error)) return MISSING;
      return { kind: 'unreadable', fileName, reason: userFacingMessage(error) };
    }
    const parsed = parseProjectNote(content);
    if (parsed.kind === 'unreadable') return { kind: 'unreadable', fileName, reason: parsed.reason };
    return { kind: 'ok', fileName, content, colour: parsed.colour };
  }

  private write(fileName: string, content: string): Promise<void> {
    return this.writer.write(this.pathOf(fileName), content);
  }

  private async ensureFolder(): Promise<void> {
    try {
      await createChildFolder(this.boardPath, PROJECT_NOTES_FOLDER);
    } catch (error) {
      if (isNotFound(error)) throw boardError(BoardMessage.boardFolderMissing);
      throw error;
    }
  }

  private async readFolder(): Promise<Dirent[]> {
    try {
      return await readdir(this.folderPath, { withFileTypes: true });
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  private pathOf(fileName: string): string {
    return path.join(this.folderPath, fileName);
  }

  private idOf(fileName: string): string {
    return `${PROJECT_NOTES_FOLDER}/${fileName}`;
  }
}
