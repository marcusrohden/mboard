import { COLUMNS, type Status, type Task, type TaskId } from '../../domain';
import { columnShortcut, type ShortcutId } from '../shortcuts/keymap';
import { useShortcuts } from '../shortcuts/shortcuts';
import type { TaskCommands } from './use-task-commands';

/** Marks an element that shows one task, so that a shortcut can act on the one that has focus. */
export const TASK_ID_ATTRIBUTE = 'data-task-id';

function focusedTask(tasks: readonly Task[]): Task | null {
  const id = document.activeElement?.closest(`[${TASK_ID_ATTRIBUTE}]`)?.getAttribute(TASK_ID_ATTRIBUTE);
  return tasks.find((task) => task.id === id) ?? null;
}

/**
 * The task shortcuts that act on the task open in the drawer, or else on the task whose card or archived
 * row has focus: ⌘1 to ⌘5 move it to the top of that column, ⇧⌘A archives a task in Done, ⇧⌘R restores an
 * archived task, ⌘O opens it in Obsidian and ⇧⌘C asks for a comment on a live task. Each does nothing for a
 * task it doesn't apply to.
 */
export function useTaskShortcuts(
  selectedTask: Task | null,
  tasks: readonly Task[],
  commands: TaskCommands,
  onComment: (id: TaskId) => void,
): void {
  const target = (): Task | null => selectedTask ?? focusedTask(tasks);

  function moveTo(status: Status): void {
    const task = target();
    if (task !== null && !task.isArchived && task.status !== status) void commands.moveToTopOf(task.id, status);
  }

  const bindings: Array<readonly [ShortcutId, () => void]> = [
    ...COLUMNS.map((status, index) => [columnShortcut(index + 1), () => moveTo(status)] as const),
    [
      'archiveTask',
      () => {
        const task = target();
        if (task !== null && !task.isArchived && task.status === 'Done') void commands.archive(task.id);
      },
    ],
    [
      'restoreTask',
      () => {
        const task = target();
        if (task?.isArchived === true) void commands.restore(task.id);
      },
    ],
    [
      'commentOnTask',
      () => {
        const task = target();
        if (task !== null && !task.isArchived) onComment(task.id);
      },
    ],
    [
      'openInObsidian',
      () => {
        const task = target();
        if (task !== null) void commands.openInObsidian(task.id);
      },
    ],
  ];
  useShortcuts(bindings);
}
