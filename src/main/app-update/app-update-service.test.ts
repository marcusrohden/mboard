import { describe, expect, it } from 'vitest';
import type { AppUpdateStatus } from '../../shared/contract';
import {
  FakeClock,
  FakeTimers,
  flushPromises,
} from '../platform/testing/fakes';
import type {
  AppUpdateInstaller,
  PreparedAppUpdate,
  PublishedRelease,
  ReleaseDownload,
  ReleaseSource,
} from './adapters';
import {
  AppUpdateService,
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
} from './app-update-service';
import { RELEASES_PAGE_URL } from './release-urls';

const DOWNLOAD: ReleaseDownload = {
  fileName: 'mboard-darwin-arm64-0.2.0.zip',
  url: 'https://github.com/marcusrohden/mboard/releases/download/v0.2.0/mboard-darwin-arm64-0.2.0.zip',
  size: 10,
  sha256: 'a'.repeat(64),
};

function releaseOf(
  version: string,
  download: ReleaseDownload | null = DOWNLOAD,
): PublishedRelease {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return {
    version: { major, minor, patch },
    releaseUrl: `https://github.com/marcusrohden/mboard/releases/tag/v${version}`,
    download,
  };
}

class FakeReleaseSource implements ReleaseSource {
  answer: PublishedRelease | null | Error = null;
  calls = 0;
  private pending: Array<() => void> = [];
  holdAnswers = false;

  latest = async (): Promise<PublishedRelease | null> => {
    this.calls++;
    if (this.holdAnswers)
      await new Promise<void>((resolve) => this.pending.push(resolve));
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  };

  release(): void {
    this.pending.splice(0).forEach((resolve) => resolve());
  }
}

class FakeInstaller implements AppUpdateInstaller {
  blocker: string | null = null;
  prepareFailure: Error | null = null;
  launchFailure: Error | null = null;
  readonly prepared: Array<{
    download: ReleaseDownload;
    version: string;
    signal: AbortSignal;
  }> = [];
  readonly launched: PreparedAppUpdate[] = [];
  leftoverSweeps = 0;
  private pending: Array<() => void> = [];
  holdPrepare = false;

  installBlocker = async (): Promise<string | null> => this.blocker;

  prepare = async (
    download: ReleaseDownload,
    version: string,
    signal: AbortSignal,
  ): Promise<PreparedAppUpdate> => {
    this.prepared.push({ download, version, signal });
    if (this.holdPrepare)
      await new Promise<void>((resolve) => this.pending.push(resolve));
    if (this.prepareFailure !== null) throw this.prepareFailure;
    return {
      version,
      bundlePath: '/T/mboard-app-update-x/unpacked/mboard.app',
      stagingFolder: '/T/mboard-app-update-x',
    };
  };

  launchSwap = async (prepared: PreparedAppUpdate): Promise<void> => {
    if (this.launchFailure !== null) throw this.launchFailure;
    this.launched.push(prepared);
  };

  removeLeftovers = async (): Promise<void> => {
    this.leftoverSweeps++;
  };

  finishPrepare(): void {
    this.pending.splice(0).forEach((resolve) => resolve());
  }
}

class FakeCountdown {
  readonly delays: number[] = [];
  private callbacks = new Set<() => void>();

  start = (callback: () => void, delayMs: number): (() => void) => {
    this.delays.push(delayMs);
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  };

  fire(): void {
    [...this.callbacks].forEach((callback) => callback());
  }

  get activeCount(): number {
    return this.callbacks.size;
  }
}

function build(
  options: { currentVersion?: string; automaticChecks?: boolean } = {},
) {
  const releases = new FakeReleaseSource();
  const installer = new FakeInstaller();
  const timers = new FakeTimers();
  const countdown = new FakeCountdown();
  const opened: string[] = [];
  const errors: unknown[] = [];
  let quits = 0;
  const service = new AppUpdateService({
    currentVersion: options.currentVersion ?? '0.1.0',
    releases,
    installer,
    clock: new FakeClock('2026-11-20T09:30:00'),
    timers,
    countdown,
    automaticChecks: options.automaticChecks ?? true,
    openExternal: async (url) => {
      opened.push(url);
    },
    quit: () => {
      quits++;
    },
    reportError: (error) => errors.push(error),
  });
  const statuses: AppUpdateStatus[] = [];
  service.onChange((status) => statuses.push(status));
  return {
    service,
    releases,
    installer,
    timers,
    countdown,
    opened,
    errors,
    statuses,
    quits: () => quits,
  };
}

describe('AppUpdateService', () => {
  it('starts idle with the running version', () => {
    expect(build().service.status()).toEqual({
      currentVersion: '0.1.0',
      stage: { kind: 'idle' },
    });
  });

  describe('check', () => {
    it('shows checking, then up to date with the time it checked', async () => {
      const { service, releases, statuses } = build();
      releases.answer = releaseOf('0.1.0');

      await expect(service.check()).resolves.toEqual({
        currentVersion: '0.1.0',
        stage: { kind: 'upToDate', checkedAt: '2026-11-20T09:30:00' },
      });
      expect(statuses.map((status) => status.stage.kind)).toEqual([
        'checking',
        'upToDate',
      ]);
    });

    it('is up to date when nothing has been released yet, or only an older version', async () => {
      const { service, releases } = build({ currentVersion: '0.3.0' });
      expect((await service.check()).stage.kind).toBe('upToDate');
      releases.answer = releaseOf('0.2.9');
      expect((await service.check()).stage.kind).toBe('upToDate');
    });

    it('offers a newer version that this copy can install', async () => {
      const { service, releases } = build();
      releases.answer = releaseOf('0.2.0');
      expect((await service.check()).stage).toEqual({
        kind: 'available',
        version: '0.2.0',
        installBlocker: null,
      });
    });

    it('says why this copy cannot install a newer version itself', async () => {
      const { service, releases, installer } = build();
      releases.answer = releaseOf('0.2.0');
      installer.blocker =
        "mboard is running from source, so it can't install new versions itself.";
      expect((await service.check()).stage).toEqual({
        kind: 'available',
        version: '0.2.0',
        installBlocker:
          "mboard is running from source, so it can't install new versions itself.",
      });
    });

    it('offers only the release page for a release whose zip cannot be checked', async () => {
      const { service, releases } = build();
      releases.answer = releaseOf('0.2.0', null);
      const { stage } = await service.check();
      expect(stage).toMatchObject({ kind: 'available', version: '0.2.0' });
      expect(stage.kind === 'available' && stage.installBlocker).toMatch(
        /download it from GitHub/,
      );
    });

    it('shows a failed check with its message', async () => {
      const { service, releases } = build();
      releases.answer = new Error(
        'GitHub is limiting update checks right now. Try again later.',
      );
      expect((await service.check()).stage).toEqual({
        kind: 'failed',
        message: 'GitHub is limiting update checks right now. Try again later.',
        version: null,
      });
    });

    it('shares one lookup between checks that overlap', async () => {
      const { service, releases } = build();
      releases.holdAnswers = true;
      const first = service.check();
      const second = service.check();
      releases.release();
      await Promise.all([first, second]);
      expect(releases.calls).toBe(1);
    });
  });

  describe('automatic checks', () => {
    it('sweep leftovers at start, check 10 s later and every 6 hours, until stopped', async () => {
      const { service, releases, installer, timers, countdown } = build();
      service.start();
      expect(installer.leftoverSweeps).toBe(1);
      expect(countdown.delays).toEqual([FIRST_CHECK_DELAY_MS]);
      expect(timers.intervals).toEqual([CHECK_INTERVAL_MS]);
      expect(FIRST_CHECK_DELAY_MS).toBe(10_000);
      expect(CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);

      countdown.fire();
      await flushPromises();
      timers.fire();
      await flushPromises();
      expect(releases.calls).toBe(2);

      service.stop();
      expect(countdown.activeCount).toBe(0);
      expect(timers.activeCount).toBe(0);
    });

    it('never check when turned off, but still sweep leftovers', () => {
      const { service, installer, timers, countdown } = build({
        automaticChecks: false,
      });
      service.start();
      expect(installer.leftoverSweeps).toBe(1);
      expect(countdown.delays).toEqual([]);
      expect(timers.intervals).toEqual([]);
    });

    it('run quietly: no checking stage, and a failure leaves the last result in place', async () => {
      const { service, releases, countdown, timers, statuses, errors } =
        build();
      releases.answer = releaseOf('0.2.0');
      service.start();
      countdown.fire();
      await flushPromises();
      releases.answer = new Error('offline');
      timers.fire();
      await flushPromises();

      expect(statuses.map((status) => status.stage.kind)).toEqual([
        'available',
      ]);
      expect(service.status().stage).toMatchObject({
        kind: 'available',
        version: '0.2.0',
      });
      expect(errors).toHaveLength(1);
    });

    it('show a failure when a manual check joins a quiet one', async () => {
      const { service, releases, countdown } = build();
      releases.answer = new Error('offline');
      releases.holdAnswers = true;
      service.start();
      countdown.fire();
      const manual = service.check();
      releases.release();
      expect((await manual).stage).toEqual({
        kind: 'failed',
        message: 'offline',
        version: null,
      });
    });
  });

  describe('install', () => {
    async function available(
      changes: {
        blocker?: string | null;
        download?: ReleaseDownload | null;
      } = {},
    ) {
      const built = build();
      built.releases.answer = releaseOf(
        '0.2.0',
        changes.download === undefined ? DOWNLOAD : changes.download,
      );
      built.installer.blocker = changes.blocker ?? null;
      await built.service.check();
      built.statuses.length = 0;
      return built;
    }

    it('downloads, launches the swap and quits', async () => {
      const { service, installer, statuses, quits } = await available();
      await service.install();

      expect(
        installer.prepared.map(({ download, version }) => [download, version]),
      ).toEqual([[DOWNLOAD, '0.2.0']]);
      expect(installer.launched).toHaveLength(1);
      expect(statuses.map((status) => status.stage)).toEqual([
        { kind: 'downloading', version: '0.2.0' },
        { kind: 'installing', version: '0.2.0' },
      ]);
      expect(quits()).toBe(1);
    });

    it('shows a failed download without quitting', async () => {
      const { service, installer, quits } = await available();
      installer.prepareFailure = new Error(
        "The downloaded file didn't match the release, so mboard didn't install it.",
      );
      await service.install();

      expect(service.status().stage).toEqual({
        kind: 'failed',
        message:
          "The downloaded file didn't match the release, so mboard didn't install it.",
        version: '0.2.0',
      });
      expect(installer.launched).toEqual([]);
      expect(quits()).toBe(0);
    });

    it('shows a swap that could not start without quitting', async () => {
      const { service, installer, quits } = await available();
      installer.launchFailure = new Error(
        "mboard couldn't start installing the new version.",
      );
      await service.install();

      expect(service.status().stage).toMatchObject({
        kind: 'failed',
        version: '0.2.0',
      });
      expect(quits()).toBe(0);
    });

    it('never shows a file system error from the board in its place', async () => {
      const { service, installer } = await available();
      installer.prepareFailure = Object.assign(
        new Error('ENOSPC: no space left on device'),
        { code: 'ENOSPC' },
      );
      await service.install();

      expect(service.status().stage).toMatchObject({
        kind: 'failed',
        message: "mboard couldn't install the new version.",
      });
    });

    it('rejects when no new version is known', async () => {
      const { service, installer } = build();
      await expect(service.install()).rejects.toThrow(
        "There's no new version to install. Check for updates first.",
      );
      expect(installer.prepared).toEqual([]);
    });

    it('rejects with the reason when this copy cannot install', async () => {
      const { service, installer } = await available({
        blocker: 'macOS is running mboard from a temporary copy.',
      });
      await expect(service.install()).rejects.toThrow(
        'macOS is running mboard from a temporary copy.',
      );
      expect(installer.prepared).toEqual([]);
    });

    it('rejects a second install while one is running, and ignores checks meanwhile', async () => {
      const { service, installer, releases } = await available();
      installer.holdPrepare = true;
      const first = service.install();
      await expect(service.install()).rejects.toThrow(
        /no new version to install/,
      );
      const callsBefore = releases.calls;
      expect((await service.check()).stage).toEqual({
        kind: 'downloading',
        version: '0.2.0',
      });
      expect(releases.calls).toBe(callsBefore);
      installer.finishPrepare();
      await first;
    });

    it('keeps showing the download when a quiet check finishes meanwhile', async () => {
      const { service, installer, releases, countdown } = await available();
      releases.holdAnswers = true;
      service.start();
      countdown.fire();
      installer.holdPrepare = true;
      const running = service.install();
      releases.release();
      await flushPromises();
      expect(service.status().stage).toEqual({
        kind: 'downloading',
        version: '0.2.0',
      });
      installer.finishPrepare();
      await running;
      expect(installer.launched).toHaveLength(1);
    });

    it('stops a running download when the service stops', async () => {
      const { service, installer } = await available();
      installer.holdPrepare = true;
      const running = service.install();
      service.stop();
      expect(installer.prepared[0]?.signal.aborted).toBe(true);
      installer.prepareFailure = new Error(
        'The download stopped before it finished.',
      );
      installer.finishPrepare();
      await running;
    });
  });

  describe('openReleasePage', () => {
    it('opens the newer release page', async () => {
      const { service, releases, opened } = build();
      releases.answer = releaseOf('0.2.0');
      await service.check();
      await service.openReleasePage();
      expect(opened).toEqual([
        'https://github.com/marcusrohden/mboard/releases/tag/v0.2.0',
      ]);
    });

    it('opens the latest release when no newer one is known', async () => {
      const { service, opened } = build();
      await service.openReleasePage();
      expect(opened).toEqual([RELEASES_PAGE_URL]);
    });
  });

  it('fails every check when its own version cannot be read', async () => {
    const { service, releases } = build({ currentVersion: 'dev' });
    releases.answer = releaseOf('0.2.0');
    expect((await service.check()).stage).toEqual({
      kind: 'failed',
      message:
        "mboard couldn't tell which version it is (dev), so it can't check for a new one.",
      version: null,
    });
  });
});
