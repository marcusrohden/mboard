import type { KeyboardEvent } from 'react';
import { dueChip, formatCompactDate, localDateOf, stalenessOf, type LocalDate, type Status, type Task } from '../../domain';
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
 * One task on the board: title, project, due chip, the created and updated dates, and the age chip,
 * whose staleness tier also colours the left edge. The whole card is the drag handle. Clicking it, or
 * pressing Enter on it, opens the detail drawer.
 */
export function TaskCard({ task, index, status, today, onOpen, onArchive }: TaskCardProps) {
  const { ref, isDragging } = useSortableTask(task.id, index, status);
  const staleness = stalenessOf(task, today);
  const chip = dueChip(task, today);

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
      <div className={styles.meta}>
        {task.project !== null && <span className={styles.project}>{task.project}</span>}
        {chip !== null && (
          <span className={styles.chip} data-tone={chip.tone}>
            {chip.text}
          </span>
        )}
      </div>
      <div className={styles.age}>
        <span className={styles.dates}>
          Created {formatCompactDate(localDateOf(task.created), today)} · Updated{' '}
          {formatCompactDate(localDateOf(task.updated), today)}
        </span>
        <AgeChip task={task} today={today} />
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
