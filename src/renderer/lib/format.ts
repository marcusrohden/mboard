import { formatShortDate, localDateOf, localTimeOf, type LocalDate, type LocalDateTime } from '../../domain';

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
