import type { LocalDate, Task, TaskId } from '../../domain';
import { columnCountLabel, type ColumnView } from '../lib/board-view';
import { Button } from '../ui/Button';
import { useColumnDropZone } from './board-dnd';
import { TaskCard } from './TaskCard';
import styles from './Column.module.css';

interface ColumnProps {
  view: ColumnView;
  tasks: Task[];
  isFiltered: boolean;
  isDropTarget: boolean;
  today: LocalDate;
  onOpen: (id: TaskId) => void;
  onArchive: (id: TaskId) => void;
  onComplete: (id: TaskId) => void;
  onComment: (id: TaskId) => void;
  onArchiveAll: () => void;
}

/**
 * One board column: its name, its "shown of total" count and its tasks. The Done column also offers Archive all.
 * The whole column accepts a dropped task, and `isDropTarget` highlights it as where the dragged task will land.
 */
export function Column({
  view,
  tasks,
  isFiltered,
  isDropTarget,
  today,
  onOpen,
  onArchive,
  onComplete,
  onComment,
  onArchiveAll,
}: ColumnProps) {
  const { ref } = useColumnDropZone(view.status);
  const emptyText = isFiltered && view.total > 0 ? 'No matching tasks' : 'No tasks';

  return (
    <section ref={ref} aria-label={view.status} className={styles.column} data-drop-target={isDropTarget || undefined}>
      <header className={styles.header}>
        <h2 className={styles.name}>{view.status}</h2>
        <span className={styles.count}>{columnCountLabel(view)}</span>
        {view.status === 'Done' && (
          <Button
            variant="quiet"
            className={styles.archiveAll}
            disabled={view.total === 0}
            shortcut="archiveAllDone"
            onClick={onArchiveAll}
          >
            Archive all
          </Button>
        )}
      </header>
      <div className={styles.tasks}>
        {tasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            index={index}
            status={view.status}
            today={today}
            onOpen={onOpen}
            onArchive={onArchive}
            onComplete={onComplete}
            onComment={onComment}
          />
        ))}
        {tasks.length === 0 && <p className={styles.empty}>{emptyText}</p>}
      </div>
    </section>
  );
}
