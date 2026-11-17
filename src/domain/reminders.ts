import type { LocalDate, LocalDateTime, Task, TaskId } from './model';
import { formatShortDate, localDateOf, localTimeOf } from './time';

/** The local time of day from which a task due today is eligible for its reminder. */
export const REMINDER_TIME = '09:00';

type ReminderSource = Pick<Task, 'id' | 'title' | 'status' | 'isArchived' | 'due' | 'created'>;

/** One notification to show. `taskId` is `null` for the grouped notification, which opens the board. */
export interface ReminderNotification {
  title: string;
  body: string;
  taskId: TaskId | null;
}

/** An entry in the in-app reminder banner, shown when system notifications fail. */
export interface ReminderBannerItem {
  taskId: TaskId;
  title: string;
  due: LocalDate;
  overdue: boolean;
}

/** What to deliver now: at most one notification, and the keys to record as fired once it is delivered or has failed. */
export interface ReminderPlan {
  notification: ReminderNotification | null;
  keys: string[];
  eligible: ReminderSource[];
}

/** The identity of one reminder: `${created}|${due}`. Changing a task's due date makes a new reminder. */
export function reminderKey(task: Pick<Task, 'created' | 'due'>): string {
  return `${task.created}|${task.due ?? ''}`;
}

function isLive(task: Pick<Task, 'status' | 'isArchived'>): boolean {
  return !task.isArchived && task.status !== 'Done';
}

/**
 * Whether a task's reminder is due at `now`: it is live (not archived, not in Done), has a due date that is
 * before today, or today once the local time is 09:00 or later, and its key hasn't fired.
 */
export function isReminderEligible(task: ReminderSource, now: LocalDateTime, firedKeys: ReadonlySet<string>): boolean {
  if (!isLive(task) || task.due === null) return false;
  if (firedKeys.has(reminderKey(task))) return false;
  const today = localDateOf(now);
  if (task.due < today) return true;
  return task.due === today && localTimeOf(now) >= REMINDER_TIME;
}

/** The tasks whose reminders are due, most overdue first, then by title. */
export function eligibleReminders<T extends ReminderSource>(
  tasks: readonly T[],
  now: LocalDateTime,
  firedKeys: ReadonlySet<string>,
): T[] {
  return tasks
    .filter((task) => isReminderEligible(task, now, firedKeys))
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.title.localeCompare(b.title, 'en-AU'));
}

function singleNotification(task: ReminderSource, today: LocalDate): ReminderNotification {
  const isOverdue = (task.due ?? today) < today;
  return {
    title: `${isOverdue ? 'Overdue' : 'Due today'}: ${task.title}`,
    body: isOverdue && task.due !== null ? `Due ${formatShortDate(task.due)}` : '',
    taskId: task.id,
  };
}

function groupedNotification(tasks: readonly ReminderSource[]): ReminderNotification {
  return {
    title: `${tasks.length} tasks due`,
    body: tasks.map((task) => task.title).join('\n'),
    taskId: null,
  };
}

/**
 * Builds the notification for a set of eligible tasks: one for a single task, one grouped notification
 * for two or more, none for an empty set.
 */
export function buildNotification(eligible: readonly ReminderSource[], today: LocalDate): ReminderNotification | null {
  const [first] = eligible;
  if (first === undefined) return null;
  return eligible.length === 1 ? singleNotification(first, today) : groupedNotification(eligible);
}

/** Works out what to deliver at `now`, and which keys to record as fired afterwards. */
export function planReminders(
  tasks: readonly ReminderSource[],
  now: LocalDateTime,
  firedKeys: ReadonlySet<string>,
): ReminderPlan {
  const eligible = eligibleReminders(tasks, now, firedKeys);
  return {
    notification: buildNotification(eligible, localDateOf(now)),
    keys: eligible.map(reminderKey),
    eligible,
  };
}

/** The reminder banner's entries for tasks whose notifications couldn't be shown. */
export function bannerItems(eligible: readonly ReminderSource[], today: LocalDate): ReminderBannerItem[] {
  return eligible.flatMap((task) =>
    task.due === null ? [] : [{ taskId: task.id, title: task.title, due: task.due, overdue: task.due < today }],
  );
}

/** A new fired set that also holds `keys`. */
export function withFiredKeys(firedKeys: ReadonlySet<string>, keys: Iterable<string>): Set<string> {
  return new Set([...firedKeys, ...keys]);
}

/** Keeps only the fired keys whose task still exists, whatever its column or whether it is archived. */
export function pruneFiredKeys(
  firedKeys: ReadonlySet<string>,
  tasks: readonly Pick<Task, 'created' | 'due'>[],
): Set<string> {
  const existing = new Set(tasks.filter((task) => task.due !== null).map(reminderKey));
  return new Set([...firedKeys].filter((key) => existing.has(key)));
}

/** How many tasks are due or overdue: not archived, not in Done, with `due <= today`. */
export function dueCount(tasks: readonly Pick<Task, 'status' | 'isArchived' | 'due'>[], today: LocalDate): number {
  return tasks.filter((task) => isLive(task) && task.due !== null && task.due <= today).length;
}

/** The text beside the menu-bar icon: the due count, or an empty string when it is 0. */
export function menuBarTitle(count: number): string {
  return count > 0 ? String(count) : '';
}
