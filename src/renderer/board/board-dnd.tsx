import { move } from '@dnd-kit/helpers';
import { DragDropProvider, KeyboardSensor, PointerSensor, useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { COLUMNS, type Status, type TaskId } from '../../domain';
import { resolveDrop, type ColumnArrangement } from '../lib/board-view';

const TASK_TYPE = 'task';
const COLUMN_TYPE = 'column';
const COLUMN_COLLISION_PRIORITY_LOW = 1;
const OPTIMISTIC_VIEW_LIFETIME_MS = 1500;

export type ColumnIds = ColumnArrangement;

const KEYBOARD_START_WITHOUT_ENTER = KeyboardSensor.configure({
  keyboardCodes: { ...KeyboardSensor.defaults.keyboardCodes, start: ['Space'] },
});

const SENSORS = [PointerSensor, KEYBOARD_START_WITHOUT_ENTER];

function signatureOf(columns: ColumnIds): string {
  return JSON.stringify(COLUMNS.map((status) => columns[status]));
}

interface BoardDndProps {
  columns: ColumnIds;
  onMove: (id: TaskId, status: Status, beforeId: TaskId | null) => Promise<boolean>;
  children: (columns: ColumnIds) => ReactNode;
}

/**
 * The only place the board touches the drag-and-drop library. It shows the dragged task moving between
 * the columns as it happens, and calls `onMove` once, when it is dropped, with the column it landed in
 * and the task it now sits above (`null` for the end). The optimistic arrangement is dropped as soon as
 * the next snapshot changes the columns, or when the move is rejected.
 */
export function BoardDnd({ columns, onMove, children }: BoardDndProps) {
  const [optimistic, setOptimistic] = useState<ColumnIds | null>(null);
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

  return (
    <DragDropProvider
      sensors={SENSORS}
      onDragOver={(event) => {
        if (event.operation.source?.type !== TASK_TYPE) return;
        const next = move(latest.current ?? columns, event);
        latest.current = next;
        setOptimistic(next);
      }}
      onDragEnd={(event) => {
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
        window.setTimeout(clearOptimistic, OPTIMISTIC_VIEW_LIFETIME_MS);
        void onMove(id, drop.status, drop.beforeId).then((moved) => {
          if (!moved) clearOptimistic();
        });
      }}
    >
      {children(displayed)}
    </DragDropProvider>
  );
}

/**
 * Makes a task element draggable and sortable within its column. Attach `ref` to the task's element.
 */
export function useSortableTask(id: TaskId, index: number, status: Status) {
  const { ref, isDragging } = useSortable({
    id,
    index,
    type: TASK_TYPE,
    accept: TASK_TYPE,
    group: status,
  });
  return { ref, isDragging };
}

/**
 * Makes a column accept dropped tasks, including when it is empty. Attach `ref` to the column's task list.
 */
export function useColumnDropZone(status: Status) {
  const { ref, isDropTarget } = useDroppable({
    id: status,
    type: COLUMN_TYPE,
    accept: TASK_TYPE,
    collisionPriority: COLUMN_COLLISION_PRIORITY_LOW,
  });
  return { ref, isDropTarget };
}
