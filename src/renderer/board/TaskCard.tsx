import type { KeyboardEvent } from 'react';
import {
  dueChip,
  formatCompactDate,
  localDateOf,
  stalenessOf,
  type LocalDate,
  type Status,
  type Task,
} from '../../domain';
import { useAgeThresholds } from '../state/age-thresholds';
import { AgeChip } from '../ui/AgeChip';
import { useSortableTask } from './board-dnd';
import styles from './TaskCard.module.css';

interface TaskCardProps {
  task: Task;
  index: number;
  status: Status;
  today: LocalDate;
  onOpen: (id: Task['id']) => void;
  onArchive: (id: Task['id']) => void;
}

/**
 * One task on the board: title, project, then the due, created and updated dates on lines of their own.
 * A due date that is today or overdue gets a coloured chip, and the updated date the age chip, whose
 * staleness tier also colours the left edge. The whole card is the drag handle. Clicking it, or pressing
 * Enter on it, opens the detail drawer.
 */
export function TaskCard({ task, index, status, today, onOpen, onArchive }: TaskCardProps) {
  const { ref, isDragging } = useSortableTask(task.id, index, status);
  const staleness = stalenessOf(task, today, useAgeThresholds());
  const due = dueChip(task, today);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Enter' && event.target === event.currentTarget) {
      event.preventDefault();
      onOpen(task.id);
    }
  }

  return (
    <article
      ref={ref}
      role="article"
      aria-label={task.title}
      tabIndex={0}
      className={styles.card}
      data-staleness={staleness.level}
      data-dragging={isDragging || undefined}
      onClick={() => onOpen(task.id)}
      onKeyDown={handleKeyDown}
    >
      <p className={styles.title}>{task.title}</p>
      {task.project !== null && <p className={styles.project}>{task.project}</p>}
      <div className={styles.dates}>
        {task.due !== null && (
          <div className={styles.dateLine}>
            <span>Due {formatCompactDate(task.due, today)}</span>
            {due !== null && due.tone !== 'neutral' && (
              <span className={styles.chip} data-tone={due.tone}>
                {due.text}
              </span>
            )}
          </div>
        )}
        <div className={styles.dateLine}>
          <span>Created {formatCompactDate(localDateOf(task.created), today)}</span>
        </div>
        <div className={styles.dateLine}>
          <span>Updated {formatCompactDate(localDateOf(task.updated), today)}</span>
          <AgeChip task={task} today={today} />
        </div>
      </div>
      {task.status === 'Done' && (
        <button
          type="button"
          className={styles.archive}
          onClick={(event) => {
            event.stopPropagation();
            onArchive(task.id);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          Archive
        </button>
      )}
    </article>
  );
}
