import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardSnapshot, Task, TaskId } from '../../shared/contract';
import { useToasts } from '../notices/ToastProvider';

export type CommandOutcome = { kind: 'unchanged' } | { kind: 'moved'; id: TaskId } | { kind: 'removed' };

export interface TaskSelection {
  selectedId: TaskId | null;
  selectedTask: Task | null;
  open: (id: TaskId) => void;
  close: () => void;
  beginCommand: () => void;
  endCommand: (id: TaskId, outcome: CommandOutcome) => void;
}

const MISSING_TASK_NOTICE = 'That task is no longer on the board, so its details were closed.';

/**
 * Tracks which task the detail drawer shows. Task ids follow the file, so a rename, an archive or a
 * restore changes the id: `endCommand` rebinds the selection to the id a command reports. While any
 * command is in flight a missing task isn't treated as gone, because the snapshot can arrive before the
 * command's own result. When the selected task really does disappear, the drawer closes with a notice.
 */
export function useTaskSelection(snapshot: BoardSnapshot | null): TaskSelection {
  const notify = useToasts();
  const [selectedId, setSelectedId] = useState<TaskId | null>(null);
  const [commandsInFlight, setCommandsInFlight] = useState(0);

  const lastSeenTask = useRef<Task | null>(null);

  const foundTask = useMemo(
    () => (selectedId === null ? null : (snapshot?.tasks.find((task) => task.id === selectedId) ?? null)),
    [selectedId, snapshot],
  );
  if (foundTask !== null) lastSeenTask.current = foundTask;

  const isAwaitingCommand = commandsInFlight > 0 && lastSeenTask.current?.id === selectedId;
  const selectedTask = foundTask ?? (isAwaitingCommand ? lastSeenTask.current : null);

  useEffect(() => {
    if (selectedId !== null && snapshot !== null && commandsInFlight === 0 && foundTask === null) {
      setSelectedId(null);
      notify(MISSING_TASK_NOTICE);
    }
  }, [selectedId, snapshot, commandsInFlight, foundTask, notify]);

  const open = useCallback((id: TaskId) => setSelectedId(id), []);
  const close = useCallback(() => setSelectedId(null), []);
  const beginCommand = useCallback(() => setCommandsInFlight((count) => count + 1), []);
  const endCommand = useCallback((id: TaskId, outcome: CommandOutcome) => {
    setCommandsInFlight((count) => count - 1);
    if (outcome.kind === 'unchanged') return;
    setSelectedId((current) => {
      if (current !== id) return current;
      return outcome.kind === 'moved' ? outcome.id : null;
    });
  }, []);

  return { selectedId, selectedTask, open, close, beginCommand, endCommand };
}
