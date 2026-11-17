import { COLUMNS, type LocalDate, type Status, type Task, type TaskId } from '../../domain';
import type { ColumnView } from '../lib/board-view';
import { Button } from '../ui/Button';
import { BoardDnd, type ColumnIds } from './board-dnd';
import { Column } from './Column';
import styles from './Board.module.css';

interface BoardProps {
  views: ColumnView[];
  isFiltered: boolean;
  today: LocalDate;
  onOpen: (id: TaskId) => void;
  onArchive: (id: TaskId) => void;
  onArchiveAll: () => void;
  onMove: (id: TaskId, status: Status, beforeId: TaskId | null) => Promise<boolean>;
  onNewTask: () => void;
}

function idsByColumn(views: ColumnView[]): ColumnIds {
  const ids: ColumnIds = { 'To do': [], 'In progress': [], Internal: [], 'With client': [], Done: [] };
  views.forEach((view) => {
    ids[view.status] = view.visible.map((task) => task.id);
  });
  return ids;
}

/**
 * The five columns, with drag and drop between and within them. An empty board invites the first task.
 */
export function Board({ views, isFiltered, today, onOpen, onArchive, onArchiveAll, onMove, onNewTask }: BoardProps) {
  const totalTasks = views.reduce((sum, view) => sum + view.total, 0);
  const taskById = new Map<TaskId, Task>(views.flatMap((view) => view.visible.map((task) => [task.id, task] as const)));

  if (totalTasks === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>No tasks yet</p>
        <Button variant="primary" onClick={onNewTask}>
          New task
        </Button>
      </div>
    );
  }

  return (
    <BoardDnd columns={idsByColumn(views)} onMove={onMove}>
      {(columns) => (
        <div className={styles.board}>
          {COLUMNS.map((status) => {
            const view = views.find((candidate) => candidate.status === status);
            if (view === undefined) return null;
            const tasks = columns[status].flatMap((id) => taskById.get(id) ?? []);
            return (
              <Column
                key={status}
                view={view}
                tasks={tasks}
                isFiltered={isFiltered}
                today={today}
                onOpen={onOpen}
                onArchive={onArchive}
                onArchiveAll={onArchiveAll}
              />
            );
          })}
        </div>
      )}
    </BoardDnd>
  );
}
