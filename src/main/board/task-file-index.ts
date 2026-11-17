import type { TaskDocument } from '../../domain';
import { toTask } from '../../domain';
import type { Task, TaskId, UnreadableFile } from '../../shared/contract';
import { mapWithConcurrency } from '../fs/map-with-concurrency';
import { fingerprintOf, loadTaskFile, statTaskFile, type LoadedTaskFile } from './task-file-loader';
import type { TaskFiles } from './task-files';
import { isArchivedLocation, type TaskLocation } from './task-location';

type IndexEntry =
  | { kind: 'task'; id: TaskId; fingerprint: string; task: Task }
  | { kind: 'unreadable'; id: TaskId; fingerprint: string; reason: string };

const READ_CONCURRENCY = 32;

/** The renderer's view of a document at a location. */
export function taskAt(document: TaskDocument, location: TaskLocation): Task {
  return toTask(document, location.id, isArchivedLocation(location));
}

function toEntry(location: TaskLocation, loaded: LoadedTaskFile): IndexEntry | null {
  switch (loaded.kind) {
    case 'missing':
      return null;
    case 'unreadable':
      return { kind: 'unreadable', id: location.id, fingerprint: loaded.fingerprint, reason: loaded.reason };
    case 'task':
      return {
        kind: 'task',
        id: location.id,
        fingerprint: loaded.fingerprint,
        task: taskAt(loaded.document, location),
      };
  }
}

function byId(a: { id: TaskId }, b: { id: TaskId }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The in-memory picture of a board's task files, rebuilt from disk by `scan` and kept current after each
 * write by `refresh`. A file whose metadata hasn't changed since it was last read is not read again.
 * `revision` goes up whenever the picture changes.
 */
export class TaskFileIndex {
  private entries = new Map<TaskId, IndexEntry>();
  private sortedTasks: Task[] | null = null;
  private sortedUnreadable: UnreadableFile[] | null = null;
  private revisionCounter = 0;

  constructor(private readonly files: TaskFiles) {}

  get revision(): number {
    return this.revisionCounter;
  }

  /** Rereads the task folders, reusing every file whose metadata is unchanged. */
  async scan(): Promise<void> {
    const locations = await this.files.listTaskLocations();
    const loaded = await mapWithConcurrency(locations, READ_CONCURRENCY, (location) => this.load(location));
    const entries = loaded.filter((entry): entry is IndexEntry => entry !== null);
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));
    this.changed();
  }

  /** Rereads one file after the app wrote, moved or deleted it. */
  async refresh(location: TaskLocation): Promise<void> {
    const entry = await this.load(location);
    if (entry === null) this.entries.delete(location.id);
    else this.entries.set(entry.id, entry);
    this.changed();
  }

  /** Every readable task, board and archive, sorted by id. */
  tasks(): Task[] {
    this.sortedTasks ??= [...this.entries.values()]
      .flatMap((entry) => (entry.kind === 'task' ? [entry.task] : []))
      .sort(byId);
    return this.sortedTasks;
  }

  /** Every task file that couldn't be read, sorted by id. */
  unreadable(): UnreadableFile[] {
    this.sortedUnreadable ??= [...this.entries.values()]
      .flatMap((entry) => (entry.kind === 'unreadable' ? [{ id: entry.id, reason: entry.reason }] : []))
      .sort(byId);
    return this.sortedUnreadable;
  }

  private changed(): void {
    this.sortedTasks = null;
    this.sortedUnreadable = null;
    this.revisionCounter += 1;
  }

  private async load(location: TaskLocation): Promise<IndexEntry | null> {
    const filePath = this.files.pathOf(location);
    const stats = await statTaskFile(filePath).catch(() => undefined);
    if (stats === null) return null;
    const previous = this.entries.get(location.id);
    if (stats !== undefined && previous !== undefined && previous.fingerprint === fingerprintOf(stats)) {
      return previous;
    }
    return toEntry(location, await loadTaskFile(filePath, location.fileName, stats));
  }
}
