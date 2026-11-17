import type { FolderChoice } from '../../shared/contract';
import type { BoardSetupService } from '../ports';
import { userFacingMessage } from '../user-facing-error';

/** The native dialogs a menu-started folder change shows. */
export interface FolderChangeDialogs {
  /** Shows the folder picker and resolves with the chosen folder, or `null` when cancelled. */
  pickBoardFolder(): Promise<string | null>;
  showRejection(message: string): Promise<void>;
  /** Asks whether to use a folder outside a vault. Resolves `true` for **Use anyway**. */
  confirmOutsideVault(message: string): Promise<boolean>;
  showError(message: string): Promise<void>;
}

/**
 * **Change board folder…** started from the app menu or the tray (spec section 4). It shows the window,
 * the folder picker, and then a rejection or the vault warning as native message boxes. An accepted folder
 * changes the app state, which setup announces to its listeners and so to the renderer. Only one change runs
 * at a time; asking again while one is open does nothing.
 */
export class MenuFolderChange {
  private running = false;

  constructor(
    private readonly setup: BoardSetupService,
    private readonly dialogs: FolderChangeDialogs,
    private readonly showWindow: () => Promise<void>,
  ) {}

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.showWindow();
      const folder = await this.dialogs.pickBoardFolder();
      if (folder !== null) await this.settle(await this.setup.choose(folder));
    } catch (error) {
      await this.dialogs.showError(userFacingMessage(error)).catch(() => undefined);
    } finally {
      this.running = false;
    }
  }

  private async settle(choice: FolderChoice): Promise<void> {
    if (choice.kind === 'rejected') return this.dialogs.showRejection(choice.message);
    if (choice.kind !== 'needsConfirmation') return;
    if (await this.dialogs.confirmOutsideVault(choice.message))
      await this.settle(await this.setup.confirm(choice.path));
  }
}
