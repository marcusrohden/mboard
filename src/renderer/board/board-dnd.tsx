import { defaultCollisionDetection, type CollisionDetector } from '@dnd-kit/collision';
import { StyleInjector } from '@dnd-kit/dom';
import { move } from '@dnd-kit/helpers';
import { DragDropProvider, DragOverlay, KeyboardSensor, PointerSensor, useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { COLUMNS, type Status, type TaskId } from '../../domain';
import { columnOf, resolveDrop, type ColumnArrangement } from '../lib/board-view';
import { readCspNonce } from '../lib/csp-nonce';

const TASK_TYPE = 'task';
const COLUMN_TYPE = 'column';
const COLUMN_COLLISION_PRIORITY_LOW = 1;
const OPTIMISTIC_VIEW_LIFETIME_MS = 1500;

export type ColumnIds = ColumnArrangement;

type Plugins = NonNullable<ComponentProps<typeof DragDropProvider>['plugins']>;

const KEYBOARD_START_WITHOUT_ENTER = KeyboardSensor.configure({
  keyboardCodes: { ...KeyboardSensor.defaults.keyboardCodes, start: ['Space'] },
});

const SENSORS = [PointerSensor, KEYBOARD_START_WITHOUT_ENTER];

/**
 * dnd-kit's default plugins, with its style injector given the page's nonce. The renderer's Content Security
 * Policy only lets `<style>` elements through with that nonce, and without them the dragged task isn't placed
 * under the pointer.
 */
function pluginsWithStyleNonce(nonce: string | undefined): Plugins {
  return (defaults) => [...defaults, StyleInjector.configure({ nonce })];
}

/**
 * Lets a task be the drop target only while the pointer is inside the task's column, so the column under the
 * pointer is always the one the dragged task moves into. Without it, a task grabbed near its edge could overlap
 * the next column's tasks more than the hovered column's and flip back and forth between them.
 */
function collidesInsideColumn(status: Status): CollisionDetector {
  return (input) => {
    const column = input.droppable.manager?.registry.droppables.get(status)?.shape?.boundingRectangle;
    const pointerX = input.dragOperation.position.current.x;
    if (column !== undefined && (pointerX < column.left || pointerX > column.right)) return null;
    return defaultCollisionDetection(input);
  };
}

function signatureOf(columns: ColumnIds): string {
  return JSON.stringify(COLUMNS.map((status) => columns[status]));
}

interface BoardDndProps {
  columns: ColumnIds;
  onMove: (id: TaskId, status: Status, beforeId: TaskId | null) => Promise<boolean>;
  renderDragPreview: (id: TaskId) => ReactNode;
  children: (columns: ColumnIds, landingStatus: Status | null) => ReactNode;
}

/**
 * The only place the board touches the drag-and-drop library. It shows the dragged task moving between
 * the columns as it happens, and calls `onMove` once, when it is dropped, with the column it landed in
 * and the task it now sits above (`null` for the end). While a task is dragged, `renderDragPreview` draws the
 * copy that follows the pointer, and `children` is told the column the task would land in if dropped now.
 * The dropped task stays where it landed while `onMove` is pending, which includes a comment dialog for the
 * move. The optimistic arrangement is dropped as soon as the next snapshot changes the columns, shortly after
 * the move succeeds, or when the move is rejected or cancelled.
 */
export function BoardDnd({ columns, onMove, renderDragPreview, children }: BoardDndProps) {
  const [optimistic, setOptimistic] = useState<ColumnIds | null>(null);
  const [draggingId, setDraggingId] = useState<TaskId | null>(null);
  const [plugins] = useState(() => pluginsWithStyleNonce(readCspNonce()));
  const latest = useRef<ColumnIds | null>(null);
  const signature = signatureOf(columns);

  const clearOptimistic = useCallback(() => {
    latest.current = null;
    setOptimistic(null);
  }, []);

  useEffect(() => {
    clearOptimistic();
  }, [signature, clearOptimistic]);

  const displayed = optimistic ?? columns;
  const landingStatus = draggingId === null ? null : columnOf(displayed, draggingId);

  return (
    <DragDropProvider
      sensors={SENSORS}
      plugins={plugins}
      onDragStart={(event) => {
        const { source } = event.operation;
        if (source?.type === TASK_TYPE) setDraggingId(String(source.id));
      }}
      onDragOver={(event) => {
        if (event.operation.source?.type !== TASK_TYPE) return;
        const next = move(latest.current ?? columns, event);
        latest.current = next;
        setOptimistic(next);
      }}
      onDragEnd={(event) => {
        setDraggingId(null);
        const droppedId = event.operation.source?.id;
        const arrangement = latest.current;
        if (event.canceled || droppedId === undefined || arrangement === null) {
          clearOptimistic();
          return;
        }
        const id = String(droppedId);
        const drop = resolveDrop(columns, arrangement, id);
        if (drop === null) {
          clearOptimistic();
          return;
        }
        void onMove(id, drop.status, drop.beforeId).then((moved) => {
          if (moved) window.setTimeout(clearOptimistic, OPTIMISTIC_VIEW_LIFETIME_MS);
          else clearOptimistic();
        });
      }}
    >
      {children(displayed, landingStatus)}
      <DragOverlay>{(source) => (source.type === TASK_TYPE ? renderDragPreview(String(source.id)) : null)}</DragOverlay>
    </DragDropProvider>
  );
}

/**
 * Makes a task element draggable and sortable within its column. Attach `ref` to the task's element.
 * `isDragSource` is true while the task is the one being dragged, so its element can show where it will land.
 */
export function useSortableTask(id: TaskId, index: number, status: Status) {
  const collisionDetector = useMemo(() => collidesInsideColumn(status), [status]);
  const { ref, isDragSource } = useSortable({
    id,
    index,
    type: TASK_TYPE,
    accept: TASK_TYPE,
    group: status,
    collisionDetector,
  });
  return { ref, isDragSource };
}

/**
 * Makes a column accept dropped tasks, including when it is empty. Attach `ref` to the column's element.
 */
export function useColumnDropZone(status: Status) {
  const { ref } = useDroppable({
    id: status,
    type: COLUMN_TYPE,
    accept: TASK_TYPE,
    collisionPriority: COLUMN_COLLISION_PRIORITY_LOW,
  });
  return { ref };
}
