import type { LocalDate, Task } from './model';
import { localDateOf, workingDaysBetween } from './time';

/**
 * The working days without an update from which a live task needs a nudge (amber), is stalling (orange)
 * and is stale (red). Below `nudgeFrom` it is on track (green). Set in Settings.
 */
export interface AgeThresholds {
  nudgeFrom: number;
  stallingFrom: number;
  staleFrom: number;
}

/** The thresholds mboard starts with, and falls back to when the saved ones aren't valid. */
export const DEFAULT_AGE_THRESHOLDS: Readonly<AgeThresholds> = Object.freeze({
  nudgeFrom: 2,
  stallingFrom: 4,
  staleFrom: 6,
});

/** The smallest and largest working-day count a threshold can be. */
export const AGE_THRESHOLD_RANGE = Object.freeze({ min: 1, max: 99 });

function isThresholdDay(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= AGE_THRESHOLD_RANGE.min &&
    value <= AGE_THRESHOLD_RANGE.max
  );
}

/**
 * Why `thresholds` can't be used, in plain words, or `null` when they can: each one a whole number of
 * working days from 1 to 99, each later tier starting after the one before it.
 */
export function ageThresholdsProblem(thresholds: AgeThresholds): string | null {
  const { nudgeFrom, stallingFrom, staleFrom } = thresholds;
  if (![nudgeFrom, stallingFrom, staleFrom].every(isThresholdDay)) {
    return `Each age colour starts at a whole number of working days from ${AGE_THRESHOLD_RANGE.min} to ${AGE_THRESHOLD_RANGE.max}.`;
  }
  if (!(nudgeFrom < stallingFrom && stallingFrom < staleFrom)) {
    return 'Needs a nudge must start before Stalling, and Stalling before Stale.';
  }
  return null;
}

/** Reads saved thresholds. Anything that isn't a valid set of three falls back to the defaults as a whole. */
export function sanitiseAgeThresholds(raw: unknown): AgeThresholds {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_AGE_THRESHOLDS };
  const { nudgeFrom, stallingFrom, staleFrom } = raw as Record<string, unknown>;
  if (!isThresholdDay(nudgeFrom) || !isThresholdDay(stallingFrom) || !isThresholdDay(staleFrom)) {
    return { ...DEFAULT_AGE_THRESHOLDS };
  }
  const candidate = { nudgeFrom, stallingFrom, staleFrom };
  return ageThresholdsProblem(candidate) === null ? candidate : { ...DEFAULT_AGE_THRESHOLDS };
}

/** Whether two sets of thresholds are the same. */
export function sameAgeThresholds(a: AgeThresholds, b: AgeThresholds): boolean {
  return a.nudgeFrom === b.nudgeFrom && a.stallingFrom === b.stallingFrom && a.staleFrom === b.staleFrom;
}

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

/** The name of each live tier, as the age chip's tooltip and Settings show it. */
export function tierName(level: Exclude<StalenessLevel, 'grey'>): string {
  return TIER_NAMES[level];
}

/** The colour for a live task's working days without an update. */
export function levelForDays(days: number, thresholds: AgeThresholds): Exclude<StalenessLevel, 'grey'> {
  if (days >= thresholds.staleFrom) return 'red';
  if (days >= thresholds.stallingFrom) return 'orange';
  if (days >= thresholds.nudgeFrom) return 'amber';
  return 'green';
}

/** A task's staleness. Tasks in Done and archived tasks are grey, named Complete or Archived, and keep their count. */
export function stalenessOf(task: StalenessSource, today: LocalDate, thresholds: AgeThresholds): Staleness {
  const days = staleDays(task.updated, today);
  if (task.isArchived) return { days, level: 'grey', tier: 'Archived' };
  if (task.status === 'Done') return { days, level: 'grey', tier: 'Complete' };
  const level = levelForDays(days, thresholds);
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
