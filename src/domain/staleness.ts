import type { LocalDate, Task } from './model';
import { localDateOf, workingDaysBetween } from './time';

/** Working days without an update from which a live task needs a nudge (amber). */
export const NUDGE_FROM_WORKING_DAYS = 2;
/** Working days without an update from which a live task is stalling (orange). */
export const STALLING_FROM_WORKING_DAYS = 4;
/** Working days without an update from which a live task is stale (red). */
export const STALE_FROM_WORKING_DAYS = 6;

/** The colour of a task's age chip and left edge. `grey` is for tasks in Done and archived tasks. */
export type StalenessLevel = 'green' | 'amber' | 'orange' | 'red' | 'grey';

/** A task's working days since its last update, its colour and the tier's name. */
export interface Staleness {
  days: number;
  level: StalenessLevel;
  tier: string;
}

type StalenessSource = Pick<Task, 'updated' | 'status' | 'isArchived'>;

const TIER_NAMES: Record<Exclude<StalenessLevel, 'grey'>, string> = {
  green: 'On track',
  amber: 'Needs a nudge',
  orange: 'Stalling',
  red: 'Stale',
};

/** Working days (Monday to Friday) after the local date of `updated`, up to and including `today`. Never negative. */
export function staleDays(updated: string, today: LocalDate): number {
  return workingDaysBetween(localDateOf(updated), today);
}

/** The colour for a live task's working days without an update. */
export function levelForDays(days: number): Exclude<StalenessLevel, 'grey'> {
  if (days >= STALE_FROM_WORKING_DAYS) return 'red';
  if (days >= STALLING_FROM_WORKING_DAYS) return 'orange';
  if (days >= NUDGE_FROM_WORKING_DAYS) return 'amber';
  return 'green';
}

/** A task's staleness. Tasks in Done and archived tasks are grey, named Complete or Archived, and keep their count. */
export function stalenessOf(task: StalenessSource, today: LocalDate): Staleness {
  const days = staleDays(task.updated, today);
  if (task.isArchived) return { days, level: 'grey', tier: 'Archived' };
  if (task.status === 'Done') return { days, level: 'grey', tier: 'Complete' };
  const level = levelForDays(days);
  return { days, level, tier: TIER_NAMES[level] };
}

/** Whether a task counts for the Stale only filter: amber or worse, which never includes Done or archived tasks. */
export function isStale(staleness: Staleness): boolean {
  return staleness.level !== 'green' && staleness.level !== 'grey';
}

/** The age chip's text, the working-day count as `Nd`. */
export function ageLabel(staleness: Staleness): string {
  return `${staleness.days}d`;
}
