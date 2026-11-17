import type { Status, Task, TaskId } from './model';

/** The task fields that ordering needs. */
export type Orderable = Pick<Task, 'id' | 'order' | 'created' | 'title'>;

/** Orders closer together than this leave no room to insert between them. */
export const MINIMUM_ORDER_GAP = 1e-6;

/** The order of a task in an otherwise empty column, and of the first task after renumbering. */
export const FIRST_ORDER = 1;

export interface OrderAssignment {
  id: TaskId;
  order: number;
}

/**
 * Where a dropped task goes. Either one `order` for the moved task, or, when there is no room between its
 * neighbours, new orders for the column. A renumbering lists only the tasks whose order changes, and
 * always the moved task.
 */
export type OrderPlacement = { kind: 'single'; order: number } | { kind: 'renumber'; assignments: OrderAssignment[] };

/**
 * Column sort comparator: `order` ascending with missing orders last, then `created` descending, then
 * title, then id so that the result is always stable.
 */
export function compareColumnTasks(a: Orderable, b: Orderable): number {
  if (a.order !== b.order) {
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    return a.order - b.order;
  }
  if (a.created !== b.created) return a.created < b.created ? 1 : -1;
  return a.title.localeCompare(b.title, 'en-AU') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The live tasks in a column, in display order. Archived tasks are never in a column. */
export function columnTasks<T extends Orderable & Pick<Task, 'status' | 'isArchived'>>(
  tasks: readonly T[],
  status: Status,
): T[] {
  return tasks.filter((task) => !task.isArchived && task.status === status).sort(compareColumnTasks);
}

/** An order that puts a task above everything currently in the column. */
export function orderForTopOfColumn(column: readonly Orderable[]): number {
  const orders = column.flatMap((task) => (task.order === null ? [] : [task.order]));
  return orders.length === 0 ? FIRST_ORDER : Math.min(...orders) - 1;
}

function renumberWithInserted(neighbours: readonly Orderable[], index: number, movingId: TaskId): OrderPlacement {
  const sequence: Array<Orderable | null> = [...neighbours];
  sequence.splice(index, 0, null);
  const assignments = sequence.flatMap((task, position): OrderAssignment[] => {
    const order = FIRST_ORDER + position;
    if (task === null) return [{ id: movingId, order }];
    return task.order === order ? [] : [{ id: task.id, order }];
  });
  return { kind: 'renumber', assignments };
}

function orderBetween(previous: Orderable | undefined, next: Orderable | undefined): number | null {
  if (previous?.order === null) return null;
  const before = previous?.order;
  const after = next?.order ?? null;
  if (before === undefined) return after === null ? FIRST_ORDER : after - 1;
  if (after === null) return before + 1;
  return after - before < MINIMUM_ORDER_GAP ? null : (before + after) / 2;
}

/**
 * Works out the order for a task dropped above `beforeId`, or at the end of the column when `beforeId`
 * is `null`. `column` is the target column's live tasks; the moved task is ignored if it is among them.
 *
 * @throws Error when `beforeId` isn't in the column.
 */
export function orderForInsertBefore(
  column: readonly Orderable[],
  movingId: TaskId,
  beforeId: TaskId | null,
): OrderPlacement {
  const neighbours = column.filter((task) => task.id !== movingId).sort(compareColumnTasks);
  const index = beforeId === null ? neighbours.length : neighbours.findIndex((task) => task.id === beforeId);
  if (index === -1) throw new Error("That task isn't in the column any more.");
  const order = orderBetween(neighbours[index - 1], neighbours[index]);
  return order === null ? renumberWithInserted(neighbours, index, movingId) : { kind: 'single', order };
}

/** Sort comparator for the archived view: `archivedAt` descending with missing values last, then title. */
export function compareArchivedTasks(
  a: Pick<Task, 'id' | 'archivedAt' | 'title'>,
  b: Pick<Task, 'id' | 'archivedAt' | 'title'>,
): number {
  if (a.archivedAt !== b.archivedAt) {
    if (a.archivedAt === null) return 1;
    if (b.archivedAt === null) return -1;
    return a.archivedAt < b.archivedAt ? 1 : -1;
  }
  return a.title.localeCompare(b.title, 'en-AU') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
