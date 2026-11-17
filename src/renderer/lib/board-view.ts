import {
  COLUMNS,
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
 * The tasks each column shows: the filtered, sorted ones, and how many the column holds in all.
 */
export function buildColumnViews(tasks: readonly Task[], criteria: FilterCriteria, today: LocalDate): ColumnView[] {
  const filtered = filterBoardTasks(tasks, criteria, today);
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
 * Works out the move a drop asks for: the column the dropped task landed in and the visible task it now
 * sits above. Returns `null` when the task isn't in the arrangement, or when it ended where it began.
 */
export function resolveDrop(
  original: ColumnArrangement,
  arrangement: ColumnArrangement,
  droppedId: TaskId,
): DropTarget | null {
  const status = COLUMNS.find((column) => arrangement[column].includes(droppedId));
  if (status === undefined) return null;
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
