import type { LocalDate, Task } from './model';
import { formatShortDate } from './time';

export type DueStatus = 'none' | 'overdue' | 'today' | 'upcoming';
export type DueChipTone = 'neutral' | 'amber' | 'red';

export interface DueChip {
  text: string;
  tone: DueChipTone;
}

/** A due date's status relative to today's local date. */
export function dueStatus(due: LocalDate | null, today: LocalDate): DueStatus {
  if (due === null) return 'none';
  if (due < today) return 'overdue';
  return due === today ? 'today' : 'upcoming';
}

/**
 * The chip for a task on the board, or `null` when it has no due date. Due today is an amber "Today" and
 * overdue is a red "Overdue". Everything else, and every task in Done, shows the date in neutral.
 */
export function dueChip(task: Pick<Task, 'due' | 'status' | 'isArchived'>, today: LocalDate): DueChip | null {
  if (task.due === null) return null;
  const neutral: DueChip = { text: formatShortDate(task.due), tone: 'neutral' };
  if (task.status === 'Done' || task.isArchived) return neutral;
  switch (dueStatus(task.due, today)) {
    case 'today':
      return { text: 'Today', tone: 'amber' };
    case 'overdue':
      return { text: 'Overdue', tone: 'red' };
    default:
      return neutral;
  }
}
