import type { ReminderBannerItem, TaskId } from '../../shared/contract';
import { formatShortDate } from '../../domain';
import { reminderShortcut } from '../shortcuts/keymap';
import { ShortcutHint, shortcutAttributes, useShortcut } from '../shortcuts/shortcuts';
import { Button } from '../ui/Button';
import styles from './Notices.module.css';

interface ReminderBannerProps {
  items: readonly ReminderBannerItem[];
  notificationsUnavailable: boolean;
  onOpenTask: (id: TaskId) => void;
  onDismiss: () => void;
}

function ReminderLink({
  item,
  position,
  onOpenTask,
}: {
  item: ReminderBannerItem;
  position: number;
  onOpenTask: (id: TaskId) => void;
}) {
  const shortcut = reminderShortcut(position) ?? undefined;
  useShortcut(shortcut, () => onOpenTask(item.taskId));
  return (
    <button
      type="button"
      className={styles.reminderLink}
      {...shortcutAttributes(shortcut)}
      onClick={() => onOpenTask(item.taskId)}
    >
      {item.title}
      {shortcut !== undefined && <ShortcutHint id={shortcut} />}
    </button>
  );
}

/**
 * The in-app list of due and overdue tasks, shown when system notifications can't be delivered.
 * Each task opens its detail, the first nine also with ⌥⌘1 to ⌥⌘9. Renders nothing when there are no
 * reminders.
 */
export function ReminderBanner({ items, notificationsUnavailable, onOpenTask, onDismiss }: ReminderBannerProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Reminders" className={`${styles.notice} ${styles.reminders}`}>
      <div className={styles.noticeRow}>
        <strong>{items.length === 1 ? '1 task is due' : `${items.length} tasks are due`}</strong>
        {notificationsUnavailable && (
          <span className={styles.reason}>Notifications are unavailable, so reminders show here.</span>
        )}
        <Button variant="quiet" className={styles.dismiss} shortcut="dismissReminders" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <ul className={styles.reminderList}>
        {items.map((item, index) => (
          <li key={item.taskId}>
            <ReminderLink item={item} position={index + 1} onOpenTask={onOpenTask} />
            <span className={styles.reminderDue} data-overdue={item.overdue || undefined}>
              {item.overdue ? 'Overdue' : 'Due today'}, {formatShortDate(item.due)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
