import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTask } from '../../domain/testHelpers';
import type { Task } from '../../shared/contract';
import { createFileFiredKeysStore, REMINDERS_FILE_NAME } from './fired-keys-store';
import { createReminderScheduler, type ReminderDelivery } from './reminder-scheduler';
import { FakeBoard, FakeClock, FakeNotifier } from './testing/fakes';

const KEY_A = '2026-11-01T09:00:00|2026-11-16';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return makeTask({ id, title: id, created: '2026-11-01T09:00:00', due: '2026-11-16', ...overrides });
}

describe('reminder scheduler with reminders.json', () => {
  let userData: string;

  beforeEach(async () => {
    userData = await mkdtemp(path.join(os.tmpdir(), 'mboard-platform-'));
  });

  afterEach(async () => {
    await rm(userData, { recursive: true, force: true });
  });

  function buildScheduler(clock: FakeClock, board: FakeBoard, notifier: FakeNotifier) {
    const deliveries: ReminderDelivery[] = [];
    const scheduler = createReminderScheduler({
      board,
      clock,
      notifier,
      firedKeys: createFileFiredKeysStore(userData),
      onDelivery: (delivery) => deliveries.push(delivery),
    });
    return { scheduler, deliveries };
  }

  async function readFiredKeysFile(): Promise<{ firedKeys: string[] }> {
    return JSON.parse(await readFile(path.join(userData, REMINDERS_FILE_NAME), 'utf8'));
  }

  it('writes fired keys to reminders.json after a delivery', async () => {
    const clock = new FakeClock('2026-11-16T09:00:00');
    const board = new FakeBoard();
    board.tasks = [task('tasks/A.md')];
    const { scheduler } = buildScheduler(clock, board, new FakeNotifier());

    await scheduler.tick();

    expect(await readFiredKeysFile()).toEqual({ firedKeys: [KEY_A] });
  });

  it('keeps fired keys across a restart, so nothing fires twice', async () => {
    const clock = new FakeClock('2026-11-16T09:00:00');
    const board = new FakeBoard();
    board.tasks = [task('tasks/A.md')];
    const firstRun = new FakeNotifier();
    await buildScheduler(clock, board, firstRun).scheduler.tick();

    const secondRun = new FakeNotifier();
    await buildScheduler(clock, board, secondRun).scheduler.tick();

    expect(firstRun.requests).toHaveLength(1);
    expect(secondRun.requests).toHaveLength(0);
  });

  it('records the keys of a failed delivery too', async () => {
    const clock = new FakeClock('2026-11-16T09:00:00');
    const board = new FakeBoard();
    board.tasks = [task('tasks/A.md')];
    const notifier = new FakeNotifier();
    notifier.result = 'failed';
    const { scheduler, deliveries } = buildScheduler(clock, board, notifier);

    await scheduler.tick();

    expect(deliveries).toEqual([
      { result: 'failed', bannerItems: [{ taskId: 'tasks/A.md', title: 'tasks/A.md', due: '2026-11-16', overdue: false }] },
    ]);
    expect((await readFiredKeysFile()).firedKeys).toEqual([KEY_A]);
  });

  it('prunes keys of tasks that no longer exist, and keeps keys of Done and archived tasks', async () => {
    const clock = new FakeClock('2026-11-16T10:00:00');
    const board = new FakeBoard();
    const doneKey = '2026-11-02T09:00:00|2026-11-16';
    const archivedKey = '2026-11-03T09:00:00|2026-11-15';
    const goneKey = '2026-11-04T09:00:00|2026-11-14';
    await writeFile(
      path.join(userData, REMINDERS_FILE_NAME),
      JSON.stringify({ firedKeys: [doneKey, archivedKey, goneKey, KEY_A] }),
    );
    board.tasks = [
      task('tasks/A.md'),
      task('tasks/Done.md', { created: '2026-11-02T09:00:00', status: 'Done' }),
      task('archive/Old.md', { created: '2026-11-03T09:00:00', due: '2026-11-15', isArchived: true }),
    ];
    const { scheduler } = buildScheduler(clock, board, new FakeNotifier());

    await scheduler.tick();

    expect((await readFiredKeysFile()).firedKeys).toEqual([archivedKey, doneKey, KEY_A].sort());
  });

  it('writes atomically, leaving no temporary file behind', async () => {
    const clock = new FakeClock('2026-11-16T09:00:00');
    const board = new FakeBoard();
    board.tasks = [task('tasks/A.md')];
    await buildScheduler(clock, board, new FakeNotifier()).scheduler.tick();
    expect(await readdir(userData)).toEqual([REMINDERS_FILE_NAME]);
  });

  it('treats a malformed reminders.json as nothing fired', async () => {
    const clock = new FakeClock('2026-11-16T09:00:00');
    const board = new FakeBoard();
    board.tasks = [task('tasks/A.md')];
    await writeFile(path.join(userData, REMINDERS_FILE_NAME), '{not json');
    const notifier = new FakeNotifier();

    await buildScheduler(clock, board, notifier).scheduler.tick();

    expect(notifier.requests).toHaveLength(1);
    expect((await readFiredKeysFile()).firedKeys).toEqual([KEY_A]);
  });

  it('ignores non-string entries in reminders.json', async () => {
    const clock = new FakeClock('2026-11-16T09:00:00');
    const board = new FakeBoard();
    board.tasks = [task('tasks/A.md')];
    await writeFile(path.join(userData, REMINDERS_FILE_NAME), JSON.stringify({ firedKeys: [1, null, KEY_A] }));
    const notifier = new FakeNotifier();

    await buildScheduler(clock, board, notifier).scheduler.tick();

    expect(notifier.requests).toHaveLength(0);
  });

  it('does not write when nothing changed', async () => {
    const clock = new FakeClock('2026-11-16T08:00:00');
    const board = new FakeBoard();
    board.tasks = [task('tasks/A.md')];
    await buildScheduler(clock, board, new FakeNotifier()).scheduler.tick();
    expect(await readdir(userData)).toEqual([]);
  });

  it('queues overlapping ticks so a slow notification is never sent twice', async () => {
    const clock = new FakeClock('2026-11-16T09:00:00');
    const board = new FakeBoard();
    board.tasks = [task('tasks/A.md')];
    const notifier = new FakeNotifier();
    const { scheduler } = buildScheduler(clock, board, notifier);

    await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()]);

    expect(notifier.requests).toHaveLength(1);
  });
});
