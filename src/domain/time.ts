import type { LocalDate, LocalDateTime } from './model';

const MILLISECONDS_PER_DAY = 86_400_000;

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Formats a `Date` as a local calendar date, `YYYY-MM-DD`. */
export function formatLocalDate(date: Date): LocalDate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Formats a `Date` as a local `YYYY-MM-DDTHH:mm:ss`. */
export function formatLocalDateTime(date: Date): LocalDateTime {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${formatLocalDate(date)}T${time}`;
}

/** Formats a `Date` as the local `YYYY-MM-DD HH:mm` used by comments and the history log. */
export function formatLogTimestamp(date: Date): string {
  return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function offsetInMinutes(offset: string): number {
  if (offset.toUpperCase() === 'Z') return 0;
  const sign = offset.startsWith('-') ? -1 : 1;
  const digits = offset.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2) || '0');
  return sign * (hours * 60 + minutes);
}

/**
 * Reads a timestamp tolerantly: `YYYY-MM-DDTHH:mm:ss`, `YYYY-MM-DD HH:mm` or `YYYY-MM-DD`, with
 * optional seconds, fractional seconds and a `Z` or `+HH:mm` offset. Values without an offset are
 * local time. Returns `null` when the text isn't a real date and time.
 */
export function parseTimestamp(raw: string): Date | null {
  const match = TIMESTAMP_PATTERN.exec(raw.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText ?? 0);
  const minute = Number(minuteText ?? 0);
  const second = Number(secondText ?? 0);
  if (offset !== undefined && hourText === undefined) return null;
  if (month < 1 || month > 12 || !isRealCalendarDate(year, month, day)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (offset !== undefined) {
    const utc = new Date(0);
    utc.setUTCFullYear(year, month - 1, day);
    utc.setUTCHours(hour, minute, second, 0);
    return new Date(utc.getTime() - offsetInMinutes(offset) * 60_000);
  }
  const local = new Date(0);
  local.setFullYear(year, month - 1, day);
  local.setHours(hour, minute, second, 0);
  return local;
}

/** Reads a tolerant timestamp and returns it as local `YYYY-MM-DDTHH:mm:ss`, or `null` when it can't be read. */
export function normaliseTimestamp(raw: string): LocalDateTime | null {
  const date = parseTimestamp(raw);
  return date ? formatLocalDateTime(date) : null;
}

/** Reads a tolerant timestamp and returns it as local `YYYY-MM-DD HH:mm`, or `null` when it can't be read. */
export function normaliseLogTimestamp(raw: string): string | null {
  const date = parseTimestamp(raw);
  return date ? formatLogTimestamp(date) : null;
}

/** Returns `raw` when it is a real `YYYY-MM-DD` calendar date, otherwise `null`. */
export function parseLocalDate(raw: string): LocalDate | null {
  const match = LOCAL_DATE_PATTERN.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  return isRealCalendarDate(Number(year), Number(month), Number(day)) ? raw : null;
}

/** The date part of a `YYYY-MM-DDTHH:mm:ss` value. */
export function localDateOf(dateTime: LocalDateTime): LocalDate {
  return dateTime.slice(0, 10);
}

/** The `HH:mm` part of a `YYYY-MM-DDTHH:mm:ss` value. */
export function localTimeOf(dateTime: LocalDateTime): string {
  return dateTime.slice(11, 16);
}

function utcMillisecondsOf(date: LocalDate): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  return utc.getTime();
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. Unaffected by daylight saving. */
export function calendarDaysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((utcMillisecondsOf(to) - utcMillisecondsOf(from)) / MILLISECONDS_PER_DAY);
}

const DAYS_PER_WEEK = 7;
const WORKING_DAYS_PER_WEEK = 5;

function isWorkingWeekday(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

/**
 * Counts the Monday to Friday dates after `from`, up to and including `to`. Zero when `to` isn't later.
 * Calendar arithmetic only, so daylight saving changes don't affect it. Public holidays aren't known.
 */
export function workingDaysBetween(from: LocalDate, to: LocalDate): number {
  const days = calendarDaysBetween(from, to);
  if (days <= 0) return 0;
  const fullWeeks = Math.floor(days / DAYS_PER_WEEK);
  const fromWeekday = new Date(utcMillisecondsOf(from)).getUTCDay();
  let count = fullWeeks * WORKING_DAYS_PER_WEEK;
  for (let offset = 1; offset <= days % DAYS_PER_WEEK; offset += 1) {
    if (isWorkingWeekday((fromWeekday + offset) % DAYS_PER_WEEK)) count += 1;
  }
  return count;
}

/** Adds whole calendar days to a date. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(utcMillisecondsOf(date) + days * MILLISECONDS_PER_DAY);
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The Sunday that ends the Monday-start week containing `date`. A Sunday is its own week's end. */
export function endOfWeek(date: LocalDate): LocalDate {
  const weekday = new Date(utcMillisecondsOf(date)).getUTCDay();
  return addDays(date, weekday === 0 ? 0 : 7 - weekday);
}

/** Formats a date as `d MMM`, for example `20 Nov`. */
export function formatShortDate(date: LocalDate): string {
  const [, month, day] = date.split('-').map(Number) as [number, number, number];
  return `${day} ${MONTH_ABBREVIATIONS[month - 1]}`;
}

/** Formats a date as `d MMM` when it is in the same year as `today`, otherwise as `d MMM YYYY`. */
export function formatCompactDate(date: LocalDate, today: LocalDate): string {
  const year = date.slice(0, 4);
  return year === today.slice(0, 4) ? formatShortDate(date) : `${formatShortDate(date)} ${year}`;
}

/**
 * Formats a local date-time (`YYYY-MM-DDTHH:mm:ss`) or a log timestamp (`YYYY-MM-DD HH:mm`) as
 * `d MMM HH:mm`, with the year added when it isn't the year of `today`.
 */
export function formatCompactDateTime(dateTime: string, today: LocalDate): string {
  return `${formatCompactDate(localDateOf(dateTime), today)} ${localTimeOf(dateTime)}`;
}
