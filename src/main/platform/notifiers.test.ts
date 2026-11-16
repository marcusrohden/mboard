import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileNotifier } from './file-notifier';
import { createNotificationLog, formatLogLine, type NotificationLog, type NotificationLogEntry } from './notification-log';
import { createSystemNotifier, NOTIFICATION_TIMEOUT_MS, type NotificationHandle } from './system-notifier';
import { FakeClock } from './testing/fakes';

class RecordingLog implements NotificationLog {
  readonly entries: NotificationLogEntry[] = [];

  record = async (entry: NotificationLogEntry): Promise<void> => {
    this.entries.push(entry);
  };
}

const REQUEST = { title: 'Due today: Write report', body: '', taskId: 'tasks/Write report.md' };

describe('file notifier', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mboard-notifier-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('appends one JSON line per notification and reports shown', async () => {
    const logPath = path.join(directory, 'nested', 'notifications.jsonl');
    const notifier = createFileNotifier({ logPath, fails: false, log: new RecordingLog() });

    const first = await notifier.notify(REQUEST);
    const second = await notifier.notify({ title: '2 tasks due', body: 'A\nB', taskId: null });

    expect([first, second]).toEqual(['shown', 'shown']);
    const lines = (await readFile(logPath, 'utf8')).trimEnd().split('\n');
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { title: 'Due today: Write report', body: '', taskId: 'tasks/Write report.md' },
      { title: '2 tasks due', body: 'A\nB', taskId: null },
    ]);
  });

  it('still records the line but reports failed when notifierFails is set', async () => {
    const logPath = path.join(directory, 'notifications.jsonl');
    const log = new RecordingLog();
    const notifier = createFileNotifier({ logPath, fails: true, log });

    expect(await notifier.notify(REQUEST)).toBe('failed');

    expect(JSON.parse(await readFile(logPath, 'utf8'))).toEqual(REQUEST);
    expect(log.entries).toEqual([{ title: REQUEST.title, result: 'failed', detail: 'fake notifier' }]);
  });

  it('reports failed when the file cannot be written', async () => {
    const notifier = createFileNotifier({ logPath: directory, fails: false, log: new RecordingLog() });
    expect(await notifier.notify(REQUEST)).toBe('failed');
  });
});

describe('notification log', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'mboard-log-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('formats a line with timestamp, result and quoted title', () => {
    expect(formatLogLine('2026-11-16T09:00:00', { title: 'Due today: "X"', result: 'shown' })).toBe(
      '2026-11-16T09:00:00 notification shown "Due today: \\"X\\""\n',
    );
    expect(formatLogLine('2026-11-16T09:00:00', { title: 'T', result: 'failed', detail: 'timed out' })).toBe(
      '2026-11-16T09:00:00 notification failed "T" (timed out)\n',
    );
  });

  it('appends every outcome with the clock time', async () => {
    const filePath = path.join(directory, 'mboard.log');
    const clock = new FakeClock('2026-11-16T09:00:05');
    const log = createNotificationLog({ filePath, clock, onError: vi.fn() });

    await log.record({ title: 'A', result: 'shown' });
    clock.set('2026-11-16T09:01:05');
    await log.record({ title: 'B', result: 'failed', detail: 'denied' });

    expect(await readFile(filePath, 'utf8')).toBe(
      '2026-11-16T09:00:05 notification shown "A"\n2026-11-16T09:01:05 notification failed "B" (denied)\n',
    );
  });

  it('reports a write failure instead of throwing', async () => {
    const onError = vi.fn();
    const log = createNotificationLog({ filePath: directory, clock: new FakeClock('2026-11-16T09:00:00'), onError });
    await expect(log.record({ title: 'A', result: 'shown' })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });
});

class FakeHandle implements NotificationHandle {
  shown = false;
  throwOnShow: Error | null = null;
  private showListeners: Array<() => void> = [];
  private failedListeners: Array<(detail: string) => void> = [];
  private clickListeners: Array<() => void> = [];

  onShow = (listener: () => void): void => {
    this.showListeners.push(listener);
  };
  onFailed = (listener: (detail: string) => void): void => {
    this.failedListeners.push(listener);
  };
  onClick = (listener: () => void): void => {
    this.clickListeners.push(listener);
  };
  show = (): void => {
    if (this.throwOnShow !== null) throw this.throwOnShow;
    this.shown = true;
  };

  emitShow = (): void => this.showListeners.forEach((listener) => listener());
  emitFailed = (detail: string): void => this.failedListeners.forEach((listener) => listener(detail));
  emitClick = (): void => this.clickListeners.forEach((listener) => listener());
}

describe('system notifier', () => {
  function build(options: { supported?: boolean } = {}) {
    const handle = new FakeHandle();
    const log = new RecordingLog();
    const activations: Array<string | null> = [];
    let timeout: (() => void) | null = null;
    let cancelled = 0;
    const notifier = createSystemNotifier({
      isSupported: () => options.supported ?? true,
      create: () => handle,
      onActivate: (taskId) => activations.push(taskId),
      countdown: {
        start: (callback) => {
          timeout = callback;
          return () => {
            cancelled++;
          };
        },
      },
      log,
    });
    return { notifier, handle, log, activations, fireTimeout: () => timeout?.(), cancelled: () => cancelled };
  }

  it('resolves shown on the show event, and logs it', async () => {
    const { notifier, handle, log, cancelled } = build();
    const result = notifier.notify(REQUEST);
    expect(handle.shown).toBe(true);
    handle.emitShow();
    expect(await result).toBe('shown');
    expect(log.entries).toEqual([{ title: REQUEST.title, result: 'shown' }]);
    expect(cancelled()).toBe(1);
  });

  it('resolves failed on the failed event, and logs the reason', async () => {
    const { notifier, handle, log } = build();
    const result = notifier.notify(REQUEST);
    handle.emitFailed('not signed');
    expect(await result).toBe('failed');
    expect(log.entries).toEqual([{ title: REQUEST.title, result: 'failed', detail: 'not signed' }]);
  });

  it('resolves failed without creating a notification when they are not supported', async () => {
    const { notifier, handle, log } = build({ supported: false });
    expect(await notifier.notify(REQUEST)).toBe('failed');
    expect(handle.shown).toBe(false);
    expect(log.entries).toEqual([
      { title: REQUEST.title, result: 'failed', detail: 'notifications are not supported' },
    ]);
  });

  it('resolves failed when neither show nor failed arrives within the timeout', async () => {
    const { notifier, fireTimeout, log } = build();
    const result = notifier.notify(REQUEST);
    fireTimeout();
    expect(await result).toBe('failed');
    expect(log.entries[0]?.detail).toBe(`no response within ${NOTIFICATION_TIMEOUT_MS} ms`);
  });

  it('keeps the first outcome when a late event arrives', async () => {
    const { notifier, handle, fireTimeout, log } = build();
    const result = notifier.notify(REQUEST);
    fireTimeout();
    handle.emitShow();
    expect(await result).toBe('failed');
    expect(log.entries).toHaveLength(1);
  });

  it('resolves failed when showing throws', async () => {
    const { notifier, handle, log } = build();
    handle.throwOnShow = new Error('no permission');
    expect(await notifier.notify(REQUEST)).toBe('failed');
    expect(log.entries[0]?.detail).toBe('no permission');
  });

  it('opens the task on click, and the board for a grouped notification', async () => {
    const { notifier, handle, activations } = build();
    const single = notifier.notify(REQUEST);
    handle.emitShow();
    await single;
    handle.emitClick();
    expect(activations).toEqual(['tasks/Write report.md']);

    const grouped = build();
    const result = grouped.notifier.notify({ title: '2 tasks due', body: 'A\nB', taskId: null });
    grouped.handle.emitShow();
    await result;
    grouped.handle.emitClick();
    expect(grouped.activations).toEqual([null]);
  });

  it('uses a 10 second timeout', () => {
    expect(NOTIFICATION_TIMEOUT_MS).toBe(10_000);
  });
});
