import {
  COLUMNS,
  type AgeThresholds,
  columnTasks,
  filterBoardTasks,
  type FilterCriteria,
  type LocalDate,
  type Status,
  type Task,
  type TaskId,
} from '../../domain';

export interface ColumnView {
  status: Status;
  visible: Task[];
  total: number;
}

/**
 * The tasks each column shows: the filtered, sorted ones, and how many the column holds in all. Stale only
 * is judged by `thresholds`.
 */
export function buildColumnViews(
  tasks: readonly Task[],
  criteria: FilterCriteria,
  today: LocalDate,
  thresholds: AgeThresholds,
): ColumnView[] {
  const filtered = filterBoardTasks(tasks, criteria, today, thresholds);
  return COLUMNS.map((status) => ({
    status,
    visible: columnTasks(filtered, status),
    total: columnTasks(tasks, status).length,
  }));
}

/** The count a column header shows: "shown of total" while the column is narrowed, otherwise the total. */
export function columnCountLabel(view: Pick<ColumnView, 'visible' | 'total'>): string {
  return view.visible.length === view.total ? String(view.total) : `${view.visible.length} of ${view.total}`;
}

/**
 * Where a task goes when a button, rather than a drag, puts it at the top of a column: the id of the
 * column's current first task other than the moved one, or `null` when the column is otherwise empty.
 */
export function topOfColumnBeforeId(tasks: readonly Task[], status: Status, movingId: TaskId): TaskId | null {
  return columnTasks(tasks, status).find((task) => task.id !== movingId)?.id ?? null;
}

export type ColumnArrangement = Record<Status, TaskId[]>;

export interface DropTarget {
  status: Status;
  beforeId: TaskId | null;
}

/**
 * The column that holds `id` in `arrangement`, or `null` when no column does. While a task is dragged, this is
 * the column it lands in if dropped now.
 */
export function columnOf(arrangement: ColumnArrangement, id: TaskId): Status | null {
  return COLUMNS.find((column) => arrangement[column].includes(id)) ?? null;
}

/**
 * Works out the move a drop asks for: the column the dropped task landed in and the visible task it now
 * sits above. Returns `null` when the task isn't in the arrangement, or when it ended where it began.
 */
export function resolveDrop(
  original: ColumnArrangement,
  arrangement: ColumnArrangement,
  droppedId: TaskId,
): DropTarget | null {
  const status = columnOf(arrangement, droppedId);
  if (status === null) return null;
  const beforeId = beforeIdAfterDrop(arrangement[status], droppedId);
  const startedHere = original[status].includes(droppedId);
  const unchanged = startedHere && beforeIdAfterDrop(original[status], droppedId) === beforeId;
  return unchanged ? null : { status, beforeId };
}

/**
 * Where a dropped task now sits: the id of the task after it in its column's visible list, or `null`
 * when it is last.
 */
export function beforeIdAfterDrop(columnIds: readonly TaskId[], droppedId: TaskId): TaskId | null {
  const index = columnIds.indexOf(droppedId);
  if (index === -1) return null;
  return columnIds[index + 1] ?? null;
}
