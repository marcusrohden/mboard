import type { Task } from '../../domain';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface DeleteTaskDialogProps {
  task: Pick<Task, 'title'>;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks to confirm deleting a task, which moves its file to the Trash. Shared by the drawer and the cards. */
export function DeleteTaskDialog({ task, onConfirm, onCancel }: DeleteTaskDialogProps) {
  return (
    <ConfirmDialog
      title="Delete task?"
      message={`"${task.title}" will be moved to the Trash.`}
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
