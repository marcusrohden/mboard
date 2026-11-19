import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PROJECTS_FILE_NAME,
  parseProjectsFile,
  projectColourIndex,
  withProjectColour,
  type ProjectColour,
  type ProjectsFileContent,
} from '../../domain';
import type { AtomicFileWriter } from '../fs/atomic-file-writer';
import { isNotFound } from '../fs/fs-errors';
import { BoardMessage, boardError } from './board-messages';

const NO_PROJECT_SETTINGS: ProjectsFileContent = { kind: 'ok', colours: {} };

/**
 * The board folder's `projects.md`, which held the project colours before project notes did, and still holds
 * the colour of a project whose name can't be a note's. Its colours are read as a fallback. A missing file
 * means no colours. A file whose frontmatter can't be read is never written.
 */
export class ProjectsFile {
  readonly path: string;

  constructor(
    boardPath: string,
    private readonly writer: AtomicFileWriter,
  ) {
    this.path = path.join(boardPath, PROJECTS_FILE_NAME);
  }

  async read(): Promise<ProjectsFileContent> {
    const text = await this.readText();
    return text === null ? NO_PROJECT_SETTINGS : parseProjectsFile(text);
  }

  /**
   * Gives `project` the colour `colour`, or removes its colour when `colour` is `null`, with a fresh read and
   * an atomic write. Creates the file when it doesn't exist.
   *
   * @throws Error when the file's frontmatter can't be read.
   */
  async setColour(project: string, colour: ProjectColour | null): Promise<void> {
    const text = await this.readText();
    if (text !== null && parseProjectsFile(text).kind === 'unreadable') {
      throw boardError(BoardMessage.projectsFileUnreadable);
    }
    await this.writer.write(this.path, withProjectColour(text, project, colour));
  }

  /**
   * Removes `project`'s entry, matched ignoring case, once its colour lives in its note. Does nothing when the
   * file is missing, can't be read, or has no entry for the project.
   */
  async removeColour(project: string): Promise<void> {
    const text = await this.readText();
    if (text === null) return;
    const parsed = parseProjectsFile(text);
    if (parsed.kind === 'unreadable' || !projectColourIndex(parsed.colours).has(project.toLowerCase())) return;
    await this.writer.write(this.path, withProjectColour(text, project, null));
  }

  private async readText(): Promise<string | null> {
    try {
      return await readFile(this.path, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
}
