import { Button } from './Button';
import { AUTOFOCUS_ATTRIBUTE, Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

interface UnsavedChangesDialogProps {
  title: string;
  message: string;
  /** Whether **Don't save** is offered. Off when going on without saving isn't possible. */
  canDiscard: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * Asks whether to save changes before going on, in an alert dialog with the macOS choices: **Don't save**,
 * **Cancel** and **Save**. Focus starts on Save. ⌘↵ saves, ⌘D doesn't save, and ⌘. or Esc cancels.
 */
export function UnsavedChangesDialog({
  title,
  message,
  canDiscard,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <Modal role="alertdialog" label={title} onClose={onCancel}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {canDiscard && (
          <Button shortcut="discardChanges" className={styles.leading} onClick={onDiscard}>
            Don't save
          </Button>
        )}
        <Button shortcut="cancel" onClick={onCancel}>
          Cancel
        </Button>
        <Button {...{ [AUTOFOCUS_ATTRIBUTE]: '' }} variant="primary" shortcut="confirm" onClick={onSave}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
