import type { ReminderBannerItem, TaskId } from '../../shared/contract';
import { formatShortDate } from '../../domain';
import { Button } from '../ui/Button';
import styles from './Notices.module.css';

interface ReminderBannerProps {
  items: readonly ReminderBannerItem[];
  notificationsUnavailable: boolean;
  onOpenTask: (id: TaskId) => void;
  onDismiss: () => void;
}

/**
 * The in-app list of due and overdue tasks, shown when system notifications can't be delivered.
 * Each task opens its detail. Renders nothing when there are no reminders.
 */
export function ReminderBanner({ items, notificationsUnavailable, onOpenTask, onDismiss }: ReminderBannerProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Reminders" className={`${styles.notice} ${styles.reminders}`}>
      <div className={styles.noticeRow}>
        <strong>{items.length === 1 ? '1 task is due' : `${items.length} tasks are due`}</strong>
        {notificationsUnavailable && <span className={styles.reason}>Notifications are unavailable, so reminders show here.</span>}
        <Button variant="quiet" className={styles.dismiss} onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <ul className={styles.reminderList}>
        {items.map((item) => (
          <li key={item.taskId}>
            <button type="button" className={styles.reminderLink} onClick={() => onOpenTask(item.taskId)}>
              {item.title}
            </button>
            <span className={styles.reminderDue} data-overdue={item.overdue || undefined}>
              {item.overdue ? 'Overdue' : 'Due today'}, {formatShortDate(item.due)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
