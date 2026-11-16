import type { LocalDate, Task } from './model';
import { calendarDaysBetween, localDateOf } from './time';

export const STALE_AMBER_DAYS = 3;
export const STALE_RED_DAYS = 7;

export type StalenessLevel = 'none' | 'amber' | 'red';

export interface Staleness {
  days: number;
  level: StalenessLevel;
}

type StalenessSource = Pick<Task, 'updated' | 'status' | 'isArchived'>;

/** Calendar days from the local date of `updated` to `today`. Never negative. */
export function staleDays(updated: string, today: LocalDate): number {
  return Math.max(0, calendarDaysBetween(localDateOf(updated), today));
}

/** The colour level for a number of stale days, ignoring whether the task is complete. */
export function levelForDays(days: number): StalenessLevel {
  if (days >= STALE_RED_DAYS) return 'red';
  if (days >= STALE_AMBER_DAYS) return 'amber';
  return 'none';
}

/** A task's staleness. The level is always `none` for tasks in Done and for archived tasks. */
export function stalenessOf(task: StalenessSource, today: LocalDate): Staleness {
  const days = staleDays(task.updated, today);
  const exempt = task.status === 'Done' || task.isArchived;
  return { days, level: exempt ? 'none' : levelForDays(days) };
}

/** The `Nd` label the board shows from 3 days, or `null` when there is nothing to show. */
export function staleLabel(staleness: Staleness): string | null {
  return staleness.level === 'none' ? null : `${staleness.days}d`;
}
