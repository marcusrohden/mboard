import {
  bannerItems,
  formatLocalDateTime,
  localDateOf,
  planReminders,
  pruneFiredKeys,
  withFiredKeys,
  type ReminderNotification,
} from '../../domain';
import type { ReminderBannerItem } from '../../shared/contract';
import type { BoardService, Clock, Notifier } from '../ports';
import type { FiredKeysStore } from './adapters';

/** What happened when a reminder was sent: the notifier's result, and the banner entries to use if it failed. */
export interface ReminderDelivery {
  result: 'shown' | 'failed';
  bannerItems: ReminderBannerItem[];
}

export interface ReminderSchedulerOptions {
  board: Pick<BoardService, 'snapshot'>;
  clock: Clock;
  notifier: Notifier;
  firedKeys: FiredKeysStore;
  onDelivery(delivery: ReminderDelivery): void;
}

/** Runs reminder checks. Calls never overlap: a check that arrives during another waits its turn. */
export interface ReminderScheduler {
  tick(): Promise<void>;
}

/**
 * Creates the reminder scheduler (spec section 2). Each tick plans at most one notification from the board
 * snapshot and the fired keys, delivers it, then records its keys as fired whether it was shown or failed.
 *
 * Fired keys are pruned only while the board holds tasks, so a tick before the board has loaded can't
 * forget keys that are still needed.
 */
export function createReminderScheduler(options: ReminderSchedulerOptions): ReminderScheduler {
  const { board, clock, notifier, firedKeys, onDelivery } = options;
  let fired: Set<string> | null = null;
  let queue: Promise<void> = Promise.resolve();

  async function runTick(): Promise<void> {
    fired ??= await firedKeys.load();
    const { tasks } = board.snapshot();
    const now = formatLocalDateTime(clock.now());
    const current = tasks.length > 0 ? pruneFiredKeys(fired, tasks) : fired;
    const plan = planReminders(tasks, now, current);
    if (plan.notification === null) {
      await remember(current);
      return;
    }
    const result = await deliver(plan.notification);
    onDelivery({ result, bannerItems: result === 'failed' ? bannerItems(plan.eligible, localDateOf(now)) : [] });
    await remember(withFiredKeys(current, plan.keys));
  }

  async function deliver(notification: ReminderNotification): Promise<'shown' | 'failed'> {
    try {
      return await notifier.notify(notification);
    } catch {
      return 'failed';
    }
  }

  async function remember(next: Set<string>): Promise<void> {
    const previous = fired;
    fired = next;
    if (previous === null || !sameKeys(previous, next)) {
      await firedKeys.save(next);
    }
  }

  return {
    tick() {
      const run = queue.then(runTick);
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((key) => b.has(key));
}
