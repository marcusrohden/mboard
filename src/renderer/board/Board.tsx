import { COLUMNS, type LocalDate, type Status, type Task, type TaskId } from '../../domain';
import type { ColumnView } from '../lib/board-view';
import { Button } from '../ui/Button';
import { BoardDnd, type ColumnIds } from './board-dnd';
import { Column } from './Column';
import { TaskCardPreview } from './TaskCard';
import styles from './Board.module.css';

interface BoardProps {
  views: ColumnView[];
  isFiltered: boolean;
  today: LocalDate;
  onOpen: (id: TaskId) => void;
  onArchive: (id: TaskId) => void;
  onComplete: (id: TaskId) => void;
  onComment: (id: TaskId) => void;
  onDelete: (id: TaskId) => void;
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
 * The five columns, with drag and drop between and within them. While a task is dragged, the column it would
 * land in is highlighted. An empty board invites the first task.
 */
export function Board({
  views,
  isFiltered,
  today,
  onOpen,
  onArchive,
  onComplete,
  onComment,
  onDelete,
  onArchiveAll,
  onMove,
  onNewTask,
}: BoardProps) {
  const totalTasks = views.reduce((sum, view) => sum + view.total, 0);
  const taskById = new Map<TaskId, Task>(views.flatMap((view) => view.visible.map((task) => [task.id, task] as const)));

  function renderDragPreview(id: TaskId) {
    const task = taskById.get(id);
    return task === undefined ? null : <TaskCardPreview task={task} today={today} />;
  }

  if (totalTasks === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>No tasks yet</p>
        <Button variant="primary" shortcutHint="newTask" onClick={onNewTask}>
          New task
        </Button>
      </div>
    );
  }

  return (
    <BoardDnd columns={idsByColumn(views)} onMove={onMove} renderDragPreview={renderDragPreview}>
      {(columns, landingStatus) => (
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
                isDropTarget={landingStatus === status}
                today={today}
                onOpen={onOpen}
                onArchive={onArchive}
                onComplete={onComplete}
                onComment={onComment}
                onDelete={onDelete}
                onArchiveAll={onArchiveAll}
              />
            );
          })}
        </div>
      )}
    </BoardDnd>
  );
}
