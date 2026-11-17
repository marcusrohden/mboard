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
  today: LocalDate;
  onOpen: (id: TaskId) => void;
  onArchive: (id: TaskId) => void;
  onArchiveAll: () => void;
}

/**
 * One board column: its name, its "shown of total" count and its tasks. The Done column also offers Archive all.
 */
export function Column({ view, tasks, isFiltered, today, onOpen, onArchive, onArchiveAll }: ColumnProps) {
  const { ref, isDropTarget } = useColumnDropZone(view.status);
  const emptyText = isFiltered && view.total > 0 ? 'No matching tasks' : 'No tasks';

  return (
    <section aria-label={view.status} className={styles.column}>
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
      <div ref={ref} className={styles.tasks} data-drop-target={isDropTarget || undefined}>
        {tasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            index={index}
            status={view.status}
            today={today}
            onOpen={onOpen}
            onArchive={onArchive}
          />
        ))}
        {tasks.length === 0 && <p className={styles.empty}>{emptyText}</p>}
      </div>
    </section>
  );
}
