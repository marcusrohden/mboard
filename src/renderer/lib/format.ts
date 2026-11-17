import {
  formatCompactDateTime,
  type AgeThresholds,
  formatShortDate,
  localDateOf,
  localTimeOf,
  stalenessOf,
  type LocalDate,
  type LocalDateTime,
  type Task,
} from '../../domain';

/** A date with its year, for example `20 Nov 2026`. */
export function formatDate(date: LocalDate): string {
  return `${formatShortDate(date)} ${date.slice(0, 4)}`;
}

/** A date and time for the detail drawer, for example `16 Nov 2026, 14:03`. */
export function formatDateTime(dateTime: LocalDateTime): string {
  return `${formatDate(localDateOf(dateTime))}, ${localTimeOf(dateTime)}`;
}

/** A log timestamp (`YYYY-MM-DD HH:mm`) for display, or an empty string when the entry has none. */
export function formatLogTime(logTimestamp: string): string {
  if (logTimestamp === '') return '';
  const [date = '', time = ''] = logTimestamp.split(' ');
  return `${formatDate(date)}, ${time}`;
}

/**
 * The full text behind a task's age chip, for example
 * `Created 12 Nov 08:00 · Updated 14 Nov 09:12 — 3 working days, Needs a nudge`.
 */
export function describeAge(
  task: Pick<Task, 'created' | 'updated' | 'status' | 'isArchived'>,
  today: LocalDate,
  thresholds: AgeThresholds,
): string {
  const { days, tier } = stalenessOf(task, today, thresholds);
  const count = `${days} working ${days === 1 ? 'day' : 'days'}`;
  const created = formatCompactDateTime(task.created, today);
  const updated = formatCompactDateTime(task.updated, today);
  return `Created ${created} · Updated ${updated} — ${count}, ${tier}`;
}
