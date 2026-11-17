import { describe, expect, it } from 'vitest';
import {
  bannerItems,
  buildNotification,
  dueCount,
  eligibleReminders,
  isReminderEligible,
  menuBarTitle,
  planReminders,
  pruneFiredKeys,
  reminderKey,
  withFiredKeys,
} from './reminders';
import { makeTask } from './testHelpers';

const NONE: ReadonlySet<string> = new Set();

function dueOn(due: string | null, overrides = {}) {
  return makeTask({ due, created: '2026-11-01T09:00:00', ...overrides });
}

describe('reminderKey', () => {
  it('joins created and due', () => {
    expect(reminderKey(dueOn('2026-11-20'))).toBe('2026-11-01T09:00:00|2026-11-20');
  });
});

describe('isReminderEligible', () => {
  const dueToday = dueOn('2026-11-16');

  it('is not eligible at 08:59 on the due date', () => {
    expect(isReminderEligible(dueToday, '2026-11-16T08:59:59', NONE)).toBe(false);
  });

  it('is eligible at 09:00 on the due date', () => {
    expect(isReminderEligible(dueToday, '2026-11-16T09:00:00', NONE)).toBe(true);
    expect(isReminderEligible(dueToday, '2026-11-16T23:59:59', NONE)).toBe(true);
  });

  it('catches up an overdue task at any time of day, even before 09:00', () => {
    expect(isReminderEligible(dueOn('2026-11-10'), '2026-11-16T00:01:00', NONE)).toBe(true);
    expect(isReminderEligible(dueOn('2026-11-10'), '2026-11-16T08:00:00', NONE)).toBe(true);
  });

  it('is not eligible before the due date', () => {
    expect(isReminderEligible(dueOn('2026-11-17'), '2026-11-16T12:00:00', NONE)).toBe(false);
  });

  it('is not eligible without a due date', () => {
    expect(isReminderEligible(dueOn(null), '2026-11-16T12:00:00', NONE)).toBe(false);
  });

  it('excludes tasks in Done and archived tasks, even when overdue', () => {
    expect(isReminderEligible(dueOn('2026-11-10', { status: 'Done' }), '2026-11-16T12:00:00', NONE)).toBe(false);
    expect(isReminderEligible(dueOn('2026-11-10', { isArchived: true }), '2026-11-16T12:00:00', NONE)).toBe(false);
    expect(isReminderEligible(dueOn('2026-11-10', { status: 'In progress' }), '2026-11-16T12:00:00', NONE)).toBe(true);
  });

  it('is not eligible once its key has fired', () => {
    const fired = new Set([reminderKey(dueToday)]);
    expect(isReminderEligible(dueToday, '2026-11-16T10:00:00', fired)).toBe(false);
  });

  it('becomes eligible again when the due date changes, because the key changes', () => {
    const fired = new Set([reminderKey(dueToday)]);
    expect(isReminderEligible({ ...dueToday, due: '2026-11-15' }, '2026-11-16T10:00:00', fired)).toBe(true);
  });
});

describe('planReminders', () => {
  const tasks = [
    dueOn('2026-11-16', { id: 'tasks/Today.md', title: 'Today job' }),
    dueOn('2026-11-12', { id: 'tasks/Late.md', title: 'Late job' }),
    dueOn('2026-11-30', { id: 'tasks/Future.md', title: 'Future job' }),
  ];

  it('builds one grouped notification for two or more eligible tasks, most overdue first', () => {
    const plan = planReminders(tasks, '2026-11-16T09:00:00', NONE);
    expect(plan.notification).toEqual({ title: '2 tasks due', body: 'Late job\nToday job', taskId: null });
    expect(plan.keys).toEqual([reminderKey(tasks[1]!), reminderKey(tasks[0]!)]);
  });

  it('builds one notification for a single task due today, which opens that task', () => {
    const plan = planReminders([tasks[0]!], '2026-11-16T09:00:00', NONE);
    expect(plan.notification).toEqual({ title: 'Due today: Today job', body: '', taskId: 'tasks/Today.md' });
  });

  it('builds one notification for a single overdue task', () => {
    const plan = planReminders([tasks[1]!], '2026-11-16T09:00:00', NONE);
    expect(plan.notification).toEqual({ title: 'Overdue: Late job', body: 'Due 12 Nov', taskId: 'tasks/Late.md' });
  });

  it('at 08:59 only overdue tasks are included', () => {
    const plan = planReminders(tasks, '2026-11-16T08:59:00', NONE);
    expect(plan.notification?.title).toBe('Overdue: Late job');
  });

  it('delivers nothing when nothing is eligible', () => {
    const plan = planReminders(tasks, '2026-11-10T09:00:00', NONE);
    expect(plan).toEqual({ notification: null, keys: [], eligible: [] });
  });

  it('does not repeat a reminder after its key is recorded', () => {
    const first = planReminders(tasks, '2026-11-16T09:00:00', NONE);
    const fired = withFiredKeys(NONE, first.keys);
    const second = planReminders(tasks, '2026-11-16T09:01:00', fired);
    expect(second.notification).toBeNull();
  });

  it('only notifies about tasks that have not fired when a new one becomes eligible', () => {
    const fired = withFiredKeys(NONE, [reminderKey(tasks[1]!)]);
    const plan = planReminders(tasks, '2026-11-16T09:00:00', fired);
    expect(plan.notification?.title).toBe('Due today: Today job');
    expect(plan.keys).toEqual([reminderKey(tasks[0]!)]);
  });
});

describe('buildNotification', () => {
  it('returns null for no tasks', () => {
    expect(buildNotification([], '2026-11-16')).toBeNull();
  });

  it('lists every title in a grouped body', () => {
    const many = ['A', 'B', 'C'].map((title) => dueOn('2026-11-16', { title }));
    expect(buildNotification(many, '2026-11-16')).toMatchObject({ title: '3 tasks due', body: 'A\nB\nC' });
  });
});

describe('fired keys', () => {
  it('withFiredKeys returns a new set and leaves the original alone', () => {
    const original = new Set(['a']);
    const next = withFiredKeys(original, ['b']);
    expect([...next]).toEqual(['a', 'b']);
    expect([...original]).toEqual(['a']);
  });

  it('pruneFiredKeys drops keys whose task no longer exists, but keeps those of done and archived tasks', () => {
    const kept = dueOn('2026-11-16', { status: 'Done' });
    const archived = dueOn('2026-11-17', { isArchived: true, created: '2026-11-02T09:00:00' });
    const gone = dueOn('2026-11-18', { created: '2026-11-03T09:00:00' });
    const fired = new Set([reminderKey(kept), reminderKey(archived), reminderKey(gone), 'stale|key']);
    const pruned = pruneFiredKeys(fired, [kept, archived]);
    expect([...pruned].sort()).toEqual([reminderKey(kept), reminderKey(archived)].sort());
  });

  it('pruneFiredKeys drops the old key when a due date changes', () => {
    const before = dueOn('2026-11-16');
    const after = { ...before, due: '2026-11-20' };
    expect(pruneFiredKeys(new Set([reminderKey(before)]), [after]).size).toBe(0);
  });
});

describe('bannerItems', () => {
  it('describes each eligible task and whether it is overdue', () => {
    const items = bannerItems(
      [dueOn('2026-11-16', { id: 'tasks/A.md', title: 'A' }), dueOn('2026-11-10', { id: 'tasks/B.md', title: 'B' })],
      '2026-11-16',
    );
    expect(items).toEqual([
      { taskId: 'tasks/A.md', title: 'A', due: '2026-11-16', overdue: false },
      { taskId: 'tasks/B.md', title: 'B', due: '2026-11-10', overdue: true },
    ]);
  });
});

describe('eligibleReminders', () => {
  it('sorts by due date then title', () => {
    const tasks = [
      dueOn('2026-11-10', { title: 'B' }),
      dueOn('2026-11-10', { title: 'A' }),
      dueOn('2026-11-05', { title: 'Z' }),
    ];
    expect(eligibleReminders(tasks, '2026-11-16T10:00:00', NONE).map((task) => task.title)).toEqual(['Z', 'A', 'B']);
  });
});

describe('menu-bar count', () => {
  const today = '2026-11-16';

  it('counts live tasks due today or earlier, regardless of the time of day', () => {
    const tasks = [
      dueOn('2026-11-16'),
      dueOn('2026-11-01'),
      dueOn('2026-11-17'),
      dueOn(null),
      dueOn('2026-11-01', { status: 'Done' }),
      dueOn('2026-11-01', { isArchived: true }),
      dueOn('2026-11-16', { status: 'In progress' }),
    ];
    expect(dueCount(tasks, today)).toBe(3);
  });

  it('is hidden when 0', () => {
    expect(menuBarTitle(0)).toBe('');
    expect(menuBarTitle(3)).toBe('3');
  });
});
