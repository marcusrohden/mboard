import { formatLocalDateTime } from '../../domain';
import type { AppUpdateStage, AppUpdateStatus } from '../../shared/contract';
import { isFileSystemError } from '../fs/fs-errors';
import type { TimerPort } from '../platform/adapters';
import type { Countdown } from '../platform/system-notifier';
import type { AppUpdates, Clock } from '../ports';
import type {
  AppUpdateInstaller,
  PublishedRelease,
  ReleaseSource,
} from './adapters';
import { RELEASES_PAGE_URL, trustedReleasePageUrl } from './release-urls';
import {
  formatVersion,
  isNewerVersion,
  parseVersion,
  type AppVersion,
} from './version';

/** How long after launch the first automatic check runs. */
export const FIRST_CHECK_DELAY_MS = 10_000;

/** How often mboard checks for a new version while it keeps running. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const NOTHING_TO_INSTALL =
  "There's no new version to install. Check for updates first.";
const UNCHECKABLE_DOWNLOAD =
  "This release can't be checked before installing, so download it from GitHub instead.";
const INSTALL_FAILED = "mboard couldn't install the new version.";

export interface AppUpdateServiceOptions {
  currentVersion: string;
  releases: ReleaseSource;
  installer: AppUpdateInstaller;
  clock: Clock;
  timers: TimerPort;
  countdown: Countdown;
  /** Whether to check by itself, shortly after launch and then every few hours. */
  automaticChecks: boolean;
  openExternal(url: string): Promise<void>;
  quit(): void;
  reportError(error: unknown): void;
}

type CheckTrigger = 'manual' | 'automatic';

function failureMessage(error: unknown, fallback: string): string {
  if (
    isFileSystemError(error) ||
    !(error instanceof Error) ||
    error.message.trim() === ''
  )
    return fallback;
  return error.message;
}

/**
 * Checks GitHub for a newer release and installs it (ADR 0004). A manual check shows `checking` and any
 * failure; automatic checks run quietly and leave the last result in place when they fail. Installing
 * downloads and checks the new version, hands the swap to the installer's helper and quits mboard.
 */
export class AppUpdateService implements AppUpdates {
  private readonly current: AppVersion | null;
  private stage: AppUpdateStage = { kind: 'idle' };
  private settledStage: AppUpdateStage = this.stage;
  private newerRelease: PublishedRelease | null = null;
  private lookup: Promise<void> | null = null;
  private showLookupFailure = false;
  private download: AbortController | null = null;
  private teardown: Array<() => void> = [];
  private readonly listeners = new Set<(status: AppUpdateStatus) => void>();

  constructor(private readonly options: AppUpdateServiceOptions) {
    this.current = parseVersion(options.currentVersion);
  }

  /** Removes leftovers from an unfinished app update and starts the automatic checks, if they are on. */
  start(): void {
    this.options.installer.removeLeftovers().catch(this.options.reportError);
    if (!this.options.automaticChecks) return;
    const checkQuietly = (): void => void this.check('automatic');
    this.teardown.push(
      this.options.countdown.start(checkQuietly, FIRST_CHECK_DELAY_MS),
      this.options.timers.every(CHECK_INTERVAL_MS, checkQuietly),
    );
  }

  /** Stops the automatic checks and any running download. */
  stop(): void {
    this.teardown.splice(0).forEach((dispose) => dispose());
    this.download?.abort();
  }

  status(): AppUpdateStatus {
    return { currentVersion: this.options.currentVersion, stage: this.stage };
  }

  onChange(listener: (status: AppUpdateStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async check(trigger: CheckTrigger = 'manual'): Promise<AppUpdateStatus> {
    if (this.isInstalling()) return this.status();
    if (trigger === 'manual') {
      this.showLookupFailure = true;
      this.setStage({ kind: 'checking' });
    }
    this.lookup ??= this.lookUp().finally(() => {
      this.lookup = null;
      this.showLookupFailure = false;
    });
    await this.lookup;
    return this.status();
  }

  async install(): Promise<void> {
    const release = this.newerRelease;
    const stage = this.stage;
    if (
      stage.kind !== 'available' ||
      release === null ||
      release.download === null
    )
      throw new Error(NOTHING_TO_INSTALL);
    if (stage.installBlocker !== null) throw new Error(stage.installBlocker);
    const version = stage.version;
    const download = new AbortController();
    this.download = download;
    this.setStage({ kind: 'downloading', version });
    try {
      const prepared = await this.options.installer.prepare(
        release.download,
        version,
        download.signal,
      );
      this.setStage({ kind: 'installing', version });
      await this.options.installer.launchSwap(prepared);
    } catch (error) {
      this.options.reportError(error);
      this.setStage({
        kind: 'failed',
        message: failureMessage(error, INSTALL_FAILED),
        version,
      });
      return;
    } finally {
      this.download = null;
    }
    this.options.quit();
  }

  async openReleasePage(): Promise<void> {
    const known =
      this.newerRelease === null
        ? null
        : trustedReleasePageUrl(this.newerRelease.releaseUrl);
    await this.options.openExternal(known ?? RELEASES_PAGE_URL);
  }

  private isInstalling(): boolean {
    return (
      this.stage.kind === 'downloading' || this.stage.kind === 'installing'
    );
  }

  private async lookUp(): Promise<void> {
    try {
      const { release, stage } = await this.latest();
      if (this.isInstalling()) return;
      this.newerRelease = release;
      this.setStage(stage);
    } catch (error) {
      this.options.reportError(error);
      if (this.isInstalling()) return;
      const message = failureMessage(
        error,
        "mboard couldn't check for a new version.",
      );
      this.setStage(
        this.showLookupFailure
          ? { kind: 'failed', message, version: null }
          : this.settledStage,
      );
    }
  }

  private async latest(): Promise<{
    release: PublishedRelease | null;
    stage: AppUpdateStage;
  }> {
    if (this.current === null) {
      throw new Error(
        `mboard couldn't tell which version it is (${this.options.currentVersion}), so it can't check for a new one.`,
      );
    }
    const latest = await this.options.releases.latest();
    if (latest === null || !isNewerVersion(latest.version, this.current)) {
      return {
        release: null,
        stage: {
          kind: 'upToDate',
          checkedAt: formatLocalDateTime(this.options.clock.now()),
        },
      };
    }
    const installBlocker =
      latest.download === null
        ? UNCHECKABLE_DOWNLOAD
        : await this.options.installer.installBlocker();
    return {
      release: latest,
      stage: {
        kind: 'available',
        version: formatVersion(latest.version),
        installBlocker,
      },
    };
  }

  private setStage(next: AppUpdateStage): void {
    if (next === this.stage) return;
    this.stage = next;
    if (next.kind !== 'checking') this.settledStage = next;
    const status = this.status();
    this.listeners.forEach((listener) => listener(status));
  }
}
