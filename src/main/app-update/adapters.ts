import type { AppVersion } from './version';

/** The zip a release carries for this Mac, with what's needed to check the download. */
export interface ReleaseDownload {
  readonly fileName: string;
  readonly url: string;
  readonly size: number;
  /** The SHA-256 of the zip, as lowercase hex. */
  readonly sha256: string;
}

/**
 * The latest published release that has a zip for this Mac. `download` is `null` when the zip can't be
 * checked before installing (it has no digest), so the release can only be downloaded from its page.
 */
export interface PublishedRelease {
  readonly version: AppVersion;
  readonly releaseUrl: string;
  readonly download: ReleaseDownload | null;
}

/** Where new versions are published. */
export interface ReleaseSource {
  /**
   * The latest release, or `null` while there is nothing for this Mac yet: no release at all, or a
   * release whose zip for this Mac hasn't finished uploading.
   *
   * @throws Error with a user-presentable message when the release can't be looked up.
   */
  latest(): Promise<PublishedRelease | null>;
}

/** A downloaded, checked and unpacked new version, waiting to replace the running app. */
export interface PreparedAppUpdate {
  readonly version: string;
  /** The unpacked `.app` bundle inside the staging folder. */
  readonly bundlePath: string;
  /** The folder holding everything downloaded for this new version. Removed once the process ends. */
  readonly stagingFolder: string;
}

/** Downloads a new version and swaps it in for the running app. */
export interface AppUpdateInstaller {
  /** Why this copy of mboard can't replace itself, or `null` when it can. */
  installBlocker(): Promise<string | null>;
  /**
   * Downloads the zip into a fresh staging folder, checks its size and SHA-256, unpacks it, deletes the
   * zip and checks the unpacked app. On any failure, or when `signal` aborts, the staging folder is
   * removed before the promise rejects.
   */
  prepare(
    download: ReleaseDownload,
    version: string,
    signal: AbortSignal,
  ): Promise<PreparedAppUpdate>;
  /**
   * Starts the helper that waits for mboard to quit, replaces the app bundle, removes the staging folder
   * and opens the new version. If the helper can't start, the staging folder is removed and this rejects.
   */
  launchSwap(prepared: PreparedAppUpdate): Promise<void>;
  /** Removes staging folders left behind by an earlier run that didn't finish. */
  removeLeftovers(): Promise<void>;
}
