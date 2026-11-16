import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTask } from '../../domain/testHelpers';
import type { Preferences, ReminderBannerItem, Task } from '../../shared/contract';
import { createMenuBarPlatform, REMINDER_INTERVAL_MS } from './menu-bar-platform';
import { createHarness, flushPromises, type PlatformHarness } from './testing/fakes';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return makeTask({ id, title: id, created: '2026-11-01T09:00:00', due: '2026-11-16', ...overrides });
}

function startPlatform(dateTime: string, tasks: Task[], settings = {}, loginItemDisabled = false) {
  const harness = createHarness(dateTime, settings);
  harness.board.tasks = tasks;
  const platform = createMenuBarPlatform({ launchConfig: { loginItemDisabled }, adapters: harness.adapters });
  return { harness, platform };
}

async function started(dateTime: string, tasks: Task[], settings = {}, loginItemDisabled = false) {
  const context = startPlatform(dateTime, tasks, settings, loginItemDisabled);
  context.platform.start(context.harness.dependencies);
  await flushPromises();
  return context;
}

async function tickAt(harness: PlatformHarness, dateTime: string): Promise<void> {
  harness.clock.set(dateTime);
  harness.timers.fire();
  await flushPromises();
}

describe('reminders', () => {
  it('fires the 09:00 reminder once and does not repeat it on the next tick', async () => {
    const { harness } = await started('2026-11-16T08:59:00', [task('tasks/Write report.md', { title: 'Write report' })]);
    expect(harness.notifier.requests).toEqual([]);

    await tickAt(harness, '2026-11-16T09:00:00');
    expect(harness.notifier.requests).toEqual([
      { title: 'Due today: Write report', body: '', taskId: 'tasks/Write report.md' },
    ]);

    await tickAt(harness, '2026-11-16T09:01:00');
    await tickAt(harness, '2026-11-16T09:02:00');
    expect(harness.notifier.requests).toHaveLength(1);
  });

  it('catches up an overdue task once at start', async () => {
    const { harness } = await started('2026-11-16T07:30:00', [
      task('tasks/Late.md', { title: 'Late', due: '2026-11-10' }),
    ]);
    expect(harness.notifier.requests).toEqual([
      { title: 'Overdue: Late', body: 'Due 10 Nov', taskId: 'tasks/Late.md' },
    ]);
    await tickAt(harness, '2026-11-16T07:31:00');
    expect(harness.notifier.requests).toHaveLength(1);
  });

  it('never reminds for Done or archived tasks', async () => {
    const { harness } = await started('2026-11-16T10:00:00', [
      task('tasks/Finished.md', { status: 'Done' }),
      task('archive/Old.md', { isArchived: true, archivedAt: '2026-11-02T09:00:00' }),
    ]);
    expect(harness.notifier.requests).toEqual([]);
  });

  it('sends one grouped notification for several tasks, and its click target is the board', async () => {
    const { harness } = await started('2026-11-16T09:30:00', [
      task('tasks/A.md', { title: 'A' }),
      task('tasks/B.md', { title: 'B', due: '2026-11-12' }),
    ]);
    expect(harness.notifier.requests).toEqual([{ title: '2 tasks due', body: 'B\nA', taskId: null }]);
  });

  it('marks every task in a grouped notification as fired', async () => {
    const { harness } = await started('2026-11-16T09:30:00', [task('tasks/A.md'), task('tasks/B.md')]);
    await tickAt(harness, '2026-11-16T09:31:00');
    expect(harness.notifier.requests).toHaveLength(1);
    expect(harness.firedKeys.keys).toEqual(new Set(['2026-11-01T09:00:00|2026-11-16']));
  });

  it('reminds again when a task gets a new due date', async () => {
    const { harness } = await started('2026-11-16T09:30:00', [task('tasks/A.md', { title: 'A' })]);
    harness.board.setTasks([task('tasks/A.md', { title: 'A', due: '2026-11-16', created: '2026-11-02T09:00:00' })]);
    await tickAt(harness, '2026-11-16T09:31:00');
    expect(harness.notifier.requests).toHaveLength(2);
  });

  it('checks every 60 seconds and when the Mac wakes', async () => {
    const { harness } = await started('2026-11-16T08:00:00', [task('tasks/A.md')]);
    expect(harness.timers.intervals).toEqual([REMINDER_INTERVAL_MS]);
    expect(harness.notifier.requests).toHaveLength(0);

    harness.clock.set('2026-11-16T09:10:00');
    harness.powerMonitor.resume();
    await flushPromises();
    expect(harness.notifier.requests).toHaveLength(1);
  });

  it('does not notify before a board has loaded, and keeps fired keys until tasks exist', async () => {
    const { harness, platform } = startPlatform('2026-11-16T10:00:00', []);
    harness.firedKeys.keys = new Set(['2026-11-01T09:00:00|2026-11-16']);
    platform.start(harness.dependencies);
    await flushPromises();
    await tickAt(harness, '2026-11-16T10:01:00');
    expect(harness.firedKeys.saveCount).toBe(0);

    harness.board.setTasks([task('tasks/A.md')]);
    await tickAt(harness, '2026-11-16T10:02:00');
    expect(harness.notifier.requests).toEqual([]);
  });

  it('reports a thrown error from a tick without stopping later ticks', async () => {
    const { harness } = await started('2026-11-16T10:00:00', []);
    const boom = new Error('snapshot failed');
    vi.spyOn(harness.board, 'snapshot').mockImplementationOnce(() => {
      throw boom;
    });
    await tickAt(harness, '2026-11-16T10:01:00');
    expect(harness.errors).toEqual([boom]);
    harness.board.tasks = [task('tasks/A.md')];
    await tickAt(harness, '2026-11-16T10:02:00');
    expect(harness.notifier.requests).toHaveLength(1);
  });
});

describe('notification outcome', () => {
  it('starts with notificationsAvailable null', async () => {
    const { platform } = await started('2026-11-16T08:00:00', []);
    expect(platform.preferences().notificationsAvailable).toBeNull();
  });

  it('fills the banner and sets notificationsAvailable to false when a notification fails', async () => {
    const { harness, platform } = startPlatform('2026-11-16T09:00:00', [
      task('tasks/A.md', { title: 'A' }),
      task('tasks/B.md', { title: 'B', due: '2026-11-12' }),
    ]);
    harness.notifier.result = 'failed';
    const banners: ReminderBannerItem[][] = [];
    const preferences: Preferences[] = [];
    platform.onBannerChange((items) => banners.push(items));
    platform.onPreferencesChange((next) => preferences.push(next));

    platform.start(harness.dependencies);
    await flushPromises();

    const expected: ReminderBannerItem[] = [
      { taskId: 'tasks/B.md', title: 'B', due: '2026-11-12', overdue: true },
      { taskId: 'tasks/A.md', title: 'A', due: '2026-11-16', overdue: false },
    ];
    expect(platform.reminderBanner()).toEqual(expected);
    expect(banners).toEqual([expected]);
    expect(platform.preferences().notificationsAvailable).toBe(false);
    expect(preferences.at(-1)).toEqual({ openAtLogin: true, notificationsAvailable: false });
  });

  it('does not repeat a failed reminder, so the banner is not refilled after a dismissal', async () => {
    const { harness, platform } = startPlatform('2026-11-16T09:00:00', [task('tasks/A.md')]);
    harness.notifier.result = 'failed';
    platform.start(harness.dependencies);
    await flushPromises();
    platform.dismissReminderBanner();
    await tickAt(harness, '2026-11-16T09:01:00');
    expect(platform.reminderBanner()).toEqual([]);
    expect(harness.notifier.requests).toHaveLength(1);
  });

  it('sets notificationsAvailable to true when a notification is shown, and leaves the banner empty', async () => {
    const { platform } = await started('2026-11-16T09:00:00', [task('tasks/A.md')]);
    expect(platform.preferences().notificationsAvailable).toBe(true);
    expect(platform.reminderBanner()).toEqual([]);
  });

  it('treats a notifier that throws as a failure', async () => {
    const { harness, platform } = startPlatform('2026-11-16T09:00:00', [task('tasks/A.md')]);
    harness.notifier.notify = async () => {
      throw new Error('boom');
    };
    platform.start(harness.dependencies);
    await flushPromises();
    expect(platform.preferences().notificationsAvailable).toBe(false);
    expect(platform.reminderBanner()).toHaveLength(1);
  });

  it('clears the banner when it is dismissed and tells listeners once', async () => {
    const { harness, platform } = startPlatform('2026-11-16T09:00:00', [task('tasks/A.md')]);
    harness.notifier.result = 'failed';
    platform.start(harness.dependencies);
    await flushPromises();

    const banners: ReminderBannerItem[][] = [];
    platform.onBannerChange((items) => banners.push(items));
    platform.dismissReminderBanner();
    platform.dismissReminderBanner();

    expect(platform.reminderBanner()).toEqual([]);
    expect(banners).toEqual([[]]);
  });

  it('stops notifying a listener once it unsubscribes', async () => {
    const { harness, platform } = startPlatform('2026-11-16T09:00:00', [task('tasks/A.md')]);
    harness.notifier.result = 'failed';
    const listener = vi.fn();
    platform.onBannerChange(listener)();
    platform.start(harness.dependencies);
    await flushPromises();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('tray', () => {
  it('shows the due count beside the icon and follows board changes', async () => {
    const { harness } = await started('2026-11-16T08:00:00', [
      task('tasks/A.md', { due: '2026-11-16' }),
      task('tasks/B.md', { due: '2026-11-10' }),
      task('tasks/C.md', { due: '2026-11-20' }),
      task('tasks/D.md', { due: '2026-11-16', status: 'Done' }),
    ]);
    expect(harness.tray.title).toBe('2');

    harness.board.setTasks([task('tasks/A.md', { due: '2026-11-16' })]);
    expect(harness.tray.title).toBe('1');

    harness.board.setTasks([]);
    expect(harness.tray.title).toBe('');
  });

  it('rolls the count over at midnight on the next tick', async () => {
    const { harness } = await started('2026-11-16T23:59:00', [task('tasks/A.md', { due: '2026-11-17' })]);
    expect(harness.tray.title).toBe('');
    await tickAt(harness, '2026-11-17T00:00:00');
    expect(harness.tray.title).toBe('1');
  });

  it('offers Open mboard, Change board folder, Open at login and Quit', async () => {
    const { harness } = await started('2026-11-16T08:00:00', []);
    expect(harness.tray.labels).toEqual(['Open mboard', 'Change board folder…', 'Open at login', 'Quit']);

    harness.tray.item('Open mboard').click?.();
    harness.tray.item('Change board folder…').click?.();
    harness.tray.item('Quit').click?.();
    expect(harness.shown).toEqual([undefined]);
    expect(harness.chooseFolderCalls).toBe(1);
    expect(harness.quitCalls).toBe(1);
  });

  it('adds a disabled "Notifications unavailable" item only after a failure', async () => {
    const { harness, platform } = startPlatform('2026-11-16T09:00:00', [task('tasks/A.md')]);
    harness.notifier.result = 'failed';
    platform.start(harness.dependencies);
    await flushPromises();
    expect(harness.tray.item('Notifications unavailable').enabled).toBe(false);
  });

  it('omits "Notifications unavailable" after a shown notification', async () => {
    const { harness } = await started('2026-11-16T09:00:00', [task('tasks/A.md')]);
    expect(harness.tray.labels).not.toContain('Notifications unavailable');
  });

  it('toggles open at login from the menu and refreshes the checkbox', async () => {
    const { harness, platform } = await started('2026-11-16T08:00:00', [], { openAtLogin: true });
    expect(harness.tray.item('Open at login').checked).toBe(true);

    harness.tray.item('Open at login').click?.();
    await flushPromises();

    expect(harness.settings.updates).toEqual([{ openAtLogin: false }]);
    expect(platform.preferences().openAtLogin).toBe(false);
    expect(harness.tray.item('Open at login').checked).toBe(false);
  });
});

describe('open at login', () => {
  it('saves the setting, applies it and returns the new preferences', async () => {
    const { harness, platform } = await started('2026-11-16T08:00:00', [], { openAtLogin: false });
    harness.loginItem.calls.length = 0;
    const listener = vi.fn();
    platform.onPreferencesChange(listener);

    const result = await platform.setOpenAtLogin(true);

    expect(harness.settings.updates).toEqual([{ openAtLogin: true }]);
    expect(harness.loginItem.calls).toEqual([true]);
    expect(result).toEqual({ openAtLogin: true, notificationsAvailable: null });
    expect(platform.preferences()).toEqual(result);
    expect(listener).toHaveBeenCalledWith(result);
  });

  it('saves the setting but never calls the login item when it is disabled', async () => {
    const { harness, platform } = await started('2026-11-16T08:00:00', [], { openAtLogin: false }, true);
    await platform.setOpenAtLogin(true);
    expect(harness.settings.updates).toEqual([{ openAtLogin: true }]);
    expect(harness.loginItem.calls).toEqual([]);
    expect(platform.preferences().openAtLogin).toBe(true);
  });

  it('applies the saved setting at start when a board path is set', async () => {
    const { harness, platform } = await started('2026-11-16T08:00:00', [], { openAtLogin: true });
    expect(harness.loginItem.calls).toEqual([true]);
    expect(platform.preferences().openAtLogin).toBe(true);
  });

  it('applies a saved "off" at start too', async () => {
    const { harness } = await started('2026-11-16T08:00:00', [], { openAtLogin: false });
    expect(harness.loginItem.calls).toEqual([false]);
  });

  it('does not touch the login item at start without a board path, but still reports the saved preference', async () => {
    const { harness, platform } = await started('2026-11-16T08:00:00', [], { boardPath: null, openAtLogin: true });
    expect(harness.loginItem.calls).toEqual([]);
    expect(platform.preferences().openAtLogin).toBe(true);
  });

  it('does not touch the login item at start when it is disabled', async () => {
    const { harness } = await started('2026-11-16T08:00:00', [], { openAtLogin: true }, true);
    expect(harness.loginItem.calls).toEqual([]);
  });

  it('rejects when the platform has not been started', async () => {
    const { platform } = startPlatform('2026-11-16T08:00:00', []);
    await expect(platform.setOpenAtLogin(true)).rejects.toThrow('not been started');
  });

  it('rejects, and applies nothing, when the setting cannot be saved', async () => {
    const { harness, platform } = await started('2026-11-16T08:00:00', [], { openAtLogin: false });
    harness.loginItem.calls.length = 0;
    harness.settings.update = async () => {
      throw new Error('disk full');
    };
    await expect(platform.setOpenAtLogin(true)).rejects.toThrow('disk full');
    expect(harness.loginItem.calls).toEqual([]);
    expect(platform.preferences().openAtLogin).toBe(false);
  });
});

describe('stop', () => {
  let context: Awaited<ReturnType<typeof started>>;

  beforeEach(async () => {
    context = await started('2026-11-16T08:00:00', [task('tasks/A.md')]);
  });

  afterEach(() => context.platform.stop());

  it('clears the timer and listeners and destroys the tray', () => {
    const { harness, platform } = context;
    expect(harness.timers.activeCount).toBe(1);
    expect(harness.powerMonitor.listenerCount).toBe(1);
    expect(harness.board.listenerCount).toBe(1);

    platform.stop();

    expect(harness.timers.activeCount).toBe(0);
    expect(harness.powerMonitor.listenerCount).toBe(0);
    expect(harness.board.listenerCount).toBe(0);
    expect(harness.tray.destroyed).toBe(true);
  });

  it('can be called twice, and start can follow it', async () => {
    const { harness, platform } = context;
    platform.stop();
    platform.stop();
    platform.start(harness.dependencies);
    await flushPromises();
    expect(harness.timers.activeCount).toBe(1);
  });
});
