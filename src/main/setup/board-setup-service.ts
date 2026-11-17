import path from 'node:path';
import type { FolderClassification } from '../../domain';
import { VAULT_WARNING_MESSAGE, classifyFolder } from '../../domain';
import type { AppState, FolderChoice, UnavailableReason } from '../../shared/contract';
import { SerialQueue } from '../fs/serial-queue';
import type { BoardService, BoardSetupService, SettingsStore } from '../ports';
import { checkBoardFolder, createBoardStructure, probeFolder } from './board-folder';

/** What board setup needs from the rest of main. */
export interface BoardSetupOptions {
  settings: SettingsStore;
  board: BoardService;
  /** The board path from `MBOARD_BOARD_PATH`, which wins over settings at launch. */
  launchBoardPath?: string;
  /** Runs once after the very first board folder is saved, to apply the login item. */
  onFirstSetup?: () => Promise<unknown>;
}

type StateListener = (state: AppState) => void;

export const UNUSABLE_FOLDER_MESSAGES: Readonly<Record<UnavailableReason, string>> = {
  notFound: "This folder can't be found.",
  permissionDenied: "mboard doesn't have permission to read this folder.",
  notADirectory: "This isn't a folder.",
};

export const INVALID_FOLDER_PATH_MESSAGE = "That isn't a valid folder path.";
export const CONFIRMATION_EXPIRED_MESSAGE = 'Choose the folder again, then confirm it.';

const NEEDS_SETUP: AppState = { kind: 'needsSetup' };

function normaliseFolderPath(folderPath: string): string {
  if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath) || folderPath.includes('\0')) {
    throw new Error(INVALID_FOLDER_PATH_MESSAGE);
  }
  return path.resolve(folderPath);
}

function readyState(boardPath: string): AppState {
  return { kind: 'ready', boardPath, boardName: path.basename(boardPath) };
}

/**
 * Chooses, checks and reopens the board folder (spec section 4). It owns the app state: which board folder
 * is in use, and whether it is ready, unavailable or still to be set up. Every operation runs one at a time,
 * and listeners hear about every state it settles on.
 *
 * `MBOARD_BOARD_PATH` is used only at launch and is never saved to settings. A folder the user chooses
 * afterwards replaces it for the rest of the session.
 */
export class FileBoardSetupService implements BoardSetupService {
  private state: AppState = NEEDS_SETUP;
  private boardPath: string | null = null;
  private awaitingConfirmation: string | null = null;
  private startup: Promise<AppState> | null = null;
  private readonly queue = new SerialQueue();
  private readonly listeners = new Set<StateListener>();

  constructor(private readonly options: BoardSetupOptions) {}

  /** Works out the app state at launch and opens the board when it is ready. Safe to call more than once. */
  start(): Promise<AppState> {
    this.startup ??= this.queue.run(() => this.startUp());
    return this.startup;
  }

  async getAppState(): Promise<AppState> {
    await this.start();
    return this.state;
  }

  choose(folderPath: string): Promise<FolderChoice> {
    return this.afterStartup(() => this.chooseFolder(normaliseFolderPath(folderPath)));
  }

  confirm(folderPath: string): Promise<FolderChoice> {
    return this.afterStartup(() => this.confirmFolder(normaliseFolderPath(folderPath)));
  }

  retry(): Promise<AppState> {
    return this.afterStartup(() => this.openBoardAt(this.boardPath));
  }

  /** Subscribes to every app state the service settles on. Returns a function that unsubscribes. */
  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async afterStartup<T>(operation: () => Promise<T>): Promise<T> {
    await this.start();
    return this.queue.run(operation);
  }

  private async startUp(): Promise<AppState> {
    const launchBoardPath = this.options.launchBoardPath;
    if (launchBoardPath !== undefined) return this.openLaunchBoard(path.resolve(launchBoardPath));
    this.boardPath = (await this.options.settings.read()).boardPath;
    return this.openBoardAt(this.boardPath);
  }

  private async openLaunchBoard(folder: string): Promise<AppState> {
    if ((await checkBoardFolder(folder)) === null) {
      const classification = classifyFolder(await probeFolder(folder));
      if (classification.kind === 'rejected') {
        console.error(`mboard can't use MBOARD_BOARD_PATH ${folder}: ${classification.message}`);
        return this.openBoardAt(null);
      }
      if (classification.kind === 'newBoard') await createBoardStructure(folder);
    }
    this.boardPath = folder;
    return this.openBoardAt(folder);
  }

  private async chooseFolder(folder: string): Promise<FolderChoice> {
    const classification = await this.classify(folder);
    if (classification.kind === 'rejected') return { kind: 'rejected', path: folder, message: classification.message };
    if (classification.needsVaultConfirmation) {
      this.awaitingConfirmation = folder;
      return { kind: 'needsConfirmation', path: folder, message: VAULT_WARNING_MESSAGE };
    }
    return this.accept(folder, classification);
  }

  private async confirmFolder(folder: string): Promise<FolderChoice> {
    if (folder !== this.awaitingConfirmation) {
      return { kind: 'rejected', path: folder, message: CONFIRMATION_EXPIRED_MESSAGE };
    }
    this.awaitingConfirmation = null;
    const classification = await this.classify(folder);
    if (classification.kind === 'rejected') return { kind: 'rejected', path: folder, message: classification.message };
    return this.accept(folder, classification);
  }

  private async classify(folder: string): Promise<FolderClassification> {
    const reason = await checkBoardFolder(folder);
    if (reason !== null) return { kind: 'rejected', message: UNUSABLE_FOLDER_MESSAGES[reason] };
    return classifyFolder(await probeFolder(folder));
  }

  private async accept(
    folder: string,
    classification: Exclude<FolderClassification, { kind: 'rejected' }>,
  ): Promise<FolderChoice> {
    if (classification.kind === 'newBoard') await createBoardStructure(folder);
    const isFirstSetup = (await this.options.settings.read()).boardPath === null;
    await this.options.settings.update({ boardPath: folder });
    this.boardPath = folder;
    this.awaitingConfirmation = null;
    const state = await this.openBoardAt(folder);
    if (isFirstSetup) await this.runFirstSetup();
    return { kind: 'accepted', state };
  }

  private async runFirstSetup(): Promise<void> {
    try {
      await this.options.onFirstSetup?.();
    } catch (error) {
      console.error('mboard could not finish its first-run setup:', error);
    }
  }

  private async openBoardAt(boardPath: string | null): Promise<AppState> {
    if (boardPath === null) return this.settle(NEEDS_SETUP);
    const reason = await checkBoardFolder(boardPath);
    if (reason !== null) return this.settle({ kind: 'unavailable', path: boardPath, reason });
    try {
      await this.options.board.open(boardPath);
    } catch (error) {
      console.error(`mboard could not open the board in ${boardPath}:`, error);
      const fallbackReason = (await checkBoardFolder(boardPath)) ?? 'permissionDenied';
      return this.settle({ kind: 'unavailable', path: boardPath, reason: fallbackReason });
    }
    return this.settle(readyState(boardPath));
  }

  private async settle(state: AppState): Promise<AppState> {
    if (state.kind !== 'ready') await this.options.board.close();
    this.state = state;
    for (const listener of [...this.listeners]) {
      try {
        listener(state);
      } catch (error) {
        console.error('An app state listener failed:', error);
      }
    }
    return state;
  }
}
