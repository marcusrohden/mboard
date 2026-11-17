import { dialog, type BrowserWindow, type MessageBoxOptions, type OpenDialogOptions } from 'electron';
import type { FolderChangeDialogs } from '../setup/menu-folder-change';

const FOLDER_PICKER: OpenDialogOptions = {
  title: 'Choose a board folder',
  buttonLabel: 'Choose',
  properties: ['openDirectory', 'createDirectory'],
};

const USE_ANYWAY = 0;
const CANCEL = 1;

/**
 * Electron's native dialogs, attached as sheets to the board window when it exists. Each call looks
 * `dialog` up afresh, so end-to-end tests can replace its methods from the main process.
 */
export function createNativeDialogs(currentWindow: () => BrowserWindow | null): FolderChangeDialogs {
  const showMessageBox = (options: MessageBoxOptions) => {
    const window = currentWindow();
    return window === null ? dialog.showMessageBox(options) : dialog.showMessageBox(window, options);
  };

  return {
    async pickBoardFolder() {
      const window = currentWindow();
      const result =
        window === null
          ? await dialog.showOpenDialog(FOLDER_PICKER)
          : await dialog.showOpenDialog(window, FOLDER_PICKER);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    async showRejection(message) {
      await showMessageBox({
        type: 'warning',
        message: "mboard can't use this folder",
        detail: message,
        buttons: ['OK'],
      });
    },
    async confirmOutsideVault(message) {
      const { response } = await showMessageBox({
        type: 'question',
        message,
        buttons: ['Use anyway', 'Cancel'],
        defaultId: USE_ANYWAY,
        cancelId: CANCEL,
      });
      return response === USE_ANYWAY;
    },
    async showError(message) {
      await showMessageBox({
        type: 'error',
        message: "mboard couldn't change the board folder",
        detail: message,
        buttons: ['OK'],
      });
    },
  };
}
