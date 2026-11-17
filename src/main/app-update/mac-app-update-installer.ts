import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, open, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type {
  AppUpdateInstaller,
  PreparedAppUpdate,
  ReleaseDownload,
} from './adapters';
import type { Fetch } from './github-release-source';
import {
  appBundlePath,
  backupBundlePath,
  bundleLocationProblem,
  isStagingFolder,
  STAGING_FOLDER_PREFIX,
  unwritableFolderProblem,
  type RunningCopy,
} from './install-location';
import {
  RELAUNCH_COMMAND,
  swapCommand,
  SWAP_WAIT_LIMIT_SECONDS,
} from './swap-script';

/** Runs a command to completion and resolves with its standard output; rejects when it fails. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<string>;

/** Starts a command that outlives mboard. Resolves once it has started; rejects when it can't. */
export type DetachedSpawner = (
  command: string,
  args: readonly string[],
) => Promise<void>;

export interface MacAppUpdateInstallerOptions {
  fetch: Fetch;
  runningCopy: RunningCopy;
  /** Where staging folders go: `app.getPath('temp')`. */
  tempFolder: string;
  processId: number;
  run: CommandRunner;
  spawnDetached: DetachedSpawner;
  reportError(error: unknown): void;
}

const DITTO = '/usr/bin/ditto';
const XATTR = '/usr/bin/xattr';
const PLIST_BUDDY = '/usr/libexec/PlistBuddy';
const UNPACKED_FOLDER = 'unpacked';

const Message = {
  download:
    "mboard couldn't download the new version. Check your internet connection and try again.",
  mismatch:
    "The downloaded file didn't match the release, so mboard didn't install it.",
  unpack: "mboard couldn't unpack the new version.",
  noApp:
    "The download didn't contain the mboard app, so mboard didn't install it.",
  inspect: "mboard couldn't check the new version, so it didn't install it.",
  stopped: 'The download stopped before it finished.',
  launch: "mboard couldn't start installing the new version.",
} as const;

/** A failure whose message is already meant for the person using mboard. */
class AppUpdateFailure extends Error {}

function wrongVersionMessage(version: string): string {
  return `The download isn't mboard ${version}, so mboard didn't install it.`;
}

async function removeQuietly(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true }).catch(() => undefined);
}

async function isWritable(folder: string): Promise<boolean> {
  try {
    await access(folder, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Installs new versions of a packaged macOS app bundle without Squirrel, which needs a Developer ID
 * signature: it downloads the release zip and checks its size and the SHA-256 digest GitHub reports,
 * unpacks it with `ditto`, checks the bundle id and version, then hands the swap to a detached shell helper
 * that runs once mboard quits. The code signature isn't checked: the ad-hoc build's top-level signature
 * doesn't verify (ADR 0004), and an ad-hoc signature proves nothing the digest doesn't. Everything it
 * downloads lives in one staging folder under `tempFolder`, which is removed when the process ends,
 * whether it succeeds or fails.
 */
export function createMacAppUpdateInstaller(
  options: MacAppUpdateInstallerOptions,
): AppUpdateInstaller {
  const {
    fetch,
    runningCopy,
    tempFolder,
    processId,
    run,
    spawnDetached,
    reportError,
  } = options;
  const currentBundle = appBundlePath(runningCopy.executablePath);

  async function step<T>(
    failureMessage: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof AppUpdateFailure) throw error;
      reportError(error);
      throw new AppUpdateFailure(failureMessage);
    }
  }

  function stopIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new AppUpdateFailure(Message.stopped);
  }

  async function requestDownload(
    download: ReleaseDownload,
    signal: AbortSignal,
  ): Promise<Response> {
    const response = await step(Message.download, () =>
      fetch(download.url, { headers: { 'User-Agent': 'mboard' }, signal }),
    );
    if (!response.ok || response.body === null) {
      throw new AppUpdateFailure(
        `GitHub couldn't send the new version (HTTP ${response.status}). Try again later.`,
      );
    }
    return response;
  }

  async function downloadInto(
    zipPath: string,
    download: ReleaseDownload,
    signal: AbortSignal,
  ): Promise<void> {
    const body = (await requestDownload(download, signal))
      .body as ReadableStream<Uint8Array>;
    const hash = createHash('sha256');
    let received = 0;
    const file = await step(Message.download, () => open(zipPath, 'wx'));
    try {
      await step(Message.download, async () => {
        for await (const chunk of body) {
          received += chunk.byteLength;
          if (received > download.size)
            throw new AppUpdateFailure(Message.mismatch);
          hash.update(chunk);
          await file.write(chunk);
        }
      });
    } finally {
      await file.close();
    }
    stopIfAborted(signal);
    if (received !== download.size || hash.digest('hex') !== download.sha256) {
      throw new AppUpdateFailure(Message.mismatch);
    }
  }

  async function unpack(zipPath: string, folder: string): Promise<string> {
    await step(Message.unpack, async () => {
      await mkdir(folder);
      await run(DITTO, ['-x', '-k', zipPath, folder]);
    });
    await step(Message.unpack, () => rm(zipPath, { force: true }));
    const bundles = await step(Message.unpack, () => readdir(folder));
    const appBundles = bundles.filter((name) => path.extname(name) === '.app');
    if (appBundles.length !== 1) throw new AppUpdateFailure(Message.noApp);
    return path.join(folder, appBundles[0]!);
  }

  async function readBundleValue(bundle: string, key: string): Promise<string> {
    const plist = path.join(bundle, 'Contents', 'Info.plist');
    return (await run(PLIST_BUDDY, ['-c', `Print :${key}`, plist])).trim();
  }

  async function checkBundle(bundle: string, version: string): Promise<void> {
    const [expectedId, bundleId, bundleVersion] = await step(
      Message.inspect,
      () =>
        Promise.all([
          readBundleValue(currentBundle, 'CFBundleIdentifier'),
          readBundleValue(bundle, 'CFBundleIdentifier'),
          readBundleValue(bundle, 'CFBundleShortVersionString'),
        ]),
    );
    if (bundleId !== expectedId || bundleVersion !== version)
      throw new AppUpdateFailure(wrongVersionMessage(version));
    await run(XATTR, ['-dr', 'com.apple.quarantine', bundle]).catch(
      () => undefined,
    );
  }

  async function prepare(
    download: ReleaseDownload,
    version: string,
    signal: AbortSignal,
  ): Promise<PreparedAppUpdate> {
    stopIfAborted(signal);
    const stagingFolder = await step(Message.download, () =>
      mkdtemp(path.join(tempFolder, `${STAGING_FOLDER_PREFIX}${version}-`)),
    );
    try {
      const zipPath = path.join(
        stagingFolder,
        path.basename(download.fileName),
      );
      await downloadInto(zipPath, download, signal);
      const bundlePath = await unpack(
        zipPath,
        path.join(stagingFolder, UNPACKED_FOLDER),
      );
      stopIfAborted(signal);
      await checkBundle(bundlePath, version);
      stopIfAborted(signal);
      return { version, bundlePath, stagingFolder };
    } catch (error) {
      await removeQuietly(stagingFolder);
      throw signal.aborted ? new AppUpdateFailure(Message.stopped) : error;
    }
  }

  async function launchSwap(prepared: PreparedAppUpdate): Promise<void> {
    try {
      if (!isStagingFolder(prepared.stagingFolder, tempFolder)) {
        throw new Error(
          `Refusing to swap from outside the temp folder: ${prepared.stagingFolder}`,
        );
      }
      const { command, args } = swapCommand({
        processId,
        currentBundle,
        replacementBundle: prepared.bundlePath,
        backupBundle: backupBundlePath(currentBundle),
        stagingFolder: prepared.stagingFolder,
        relaunchCommand: RELAUNCH_COMMAND,
        waitLimitSeconds: SWAP_WAIT_LIMIT_SECONDS,
      });
      await spawnDetached(command, args);
    } catch (error) {
      reportError(error);
      await removeQuietly(prepared.stagingFolder);
      throw new AppUpdateFailure(Message.launch);
    }
  }

  async function installBlocker(): Promise<string | null> {
    const problem = bundleLocationProblem(runningCopy);
    if (problem !== null) return problem;
    const folder = path.dirname(currentBundle);
    return (await isWritable(folder)) ? null : unwritableFolderProblem(folder);
  }

  async function removeLeftovers(): Promise<void> {
    const entries = await readdir(tempFolder, { withFileTypes: true }).catch(
      () => [],
    );
    const leftovers = entries
      .filter(
        (entry) =>
          entry.isDirectory() && entry.name.startsWith(STAGING_FOLDER_PREFIX),
      )
      .map((entry) => path.join(tempFolder, entry.name));
    if (bundleLocationProblem(runningCopy) === null)
      leftovers.push(backupBundlePath(currentBundle));
    await Promise.all(leftovers.map(removeQuietly));
  }

  return { installBlocker, prepare, launchSwap, removeLeftovers };
}
