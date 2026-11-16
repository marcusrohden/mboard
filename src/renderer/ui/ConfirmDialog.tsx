import { Button } from './Button';
import { AUTOFOCUS_ATTRIBUTE, Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks the person to confirm a destructive action in an alert dialog. Focus starts on Cancel, and the
 * confirm button is named after the action, for example "Delete" or "Archive all".
 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal role="alertdialog" label={title} onClose={onCancel}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <Button {...{ [AUTOFOCUS_ATTRIBUTE]: '' }} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
