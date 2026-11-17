import path from 'node:path';

/** The prefix of every staging folder, so a later launch can find and remove leftovers. */
export const STAGING_FOLDER_PREFIX = 'mboard-app-update-';

const TRANSLOCATION_SEGMENT = `${path.sep}AppTranslocation${path.sep}`;

/** How the running copy of mboard was started. */
export interface RunningCopy {
  isPackaged: boolean;
  /** The executable, as `app.getPath('exe')` reports it: `<bundle>.app/Contents/MacOS/mboard`. */
  executablePath: string;
}

/** The `.app` bundle holding the running executable: three levels above it. */
export function appBundlePath(executablePath: string): string {
  return path.resolve(executablePath, '..', '..', '..');
}

/** Where the running bundle is moved while the new one takes its place: hidden, beside it. */
export function backupBundlePath(currentBundle: string): string {
  return path.join(path.dirname(currentBundle), `.${path.basename(currentBundle)}.app-update-backup`);
}

/**
 * Why the running copy can't replace its own bundle, judged from how it was started, or `null` when
 * nothing rules it out. Whether its folder is writable is checked separately.
 */
export function bundleLocationProblem({ isPackaged, executablePath }: RunningCopy): string | null {
  if (!isPackaged) return "mboard is running from source, so it can't install new versions itself.";
  const bundle = appBundlePath(executablePath);
  if (path.extname(bundle) !== '.app') {
    return "mboard isn't running from an app bundle, so it can't install new versions itself.";
  }
  if (bundle.includes(TRANSLOCATION_SEGMENT)) {
    return 'macOS is running mboard from a temporary copy. Move mboard to your Applications folder, open it from there and try again.';
  }
  return null;
}

/** The message for a bundle whose folder mboard can't write to. */
export function unwritableFolderProblem(folder: string): string {
  return `mboard can't replace itself in ${folder}, because it isn't allowed to change that folder.`;
}

/** Whether `folder` is a staging folder this app created directly inside `tempFolder`. */
export function isStagingFolder(folder: string, tempFolder: string): boolean {
  const name = path.basename(folder);
  return path.dirname(folder) === path.resolve(tempFolder) && name.startsWith(STAGING_FOLDER_PREFIX);
}
