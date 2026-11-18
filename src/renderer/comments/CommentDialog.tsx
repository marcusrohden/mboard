import { useId, useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { AUTOFOCUS_ATTRIBUTE, Modal } from '../ui/Modal';
import fields from '../ui/fields.module.css';
import styles from './CommentDialog.module.css';

interface CommentDialogProps {
  title: string;
  message: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  /** Whether the comment must have text. An optional one that is left empty is sent as `null`. */
  isRequired: boolean;
  /** Does what the comment is for and resolves whether it worked. */
  onSubmit: (comment: string | null) => Promise<boolean>;
  onCancel: () => void;
}

function isPlainEnter(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.nativeEvent.isComposing
  );
}

/**
 * Asks for a comment in a dialog, for a move and for a comment on its own. Enter in the box, ⌘↵ or the confirm
 * button sends it, and Shift+Enter starts a new line. ⌘., Esc or **Cancel** closes it without doing anything.
 * The dialog stays open while the comment is saved, and if saving fails, so nothing typed is lost.
 */
export function CommentDialog({
  title,
  message,
  label,
  placeholder,
  confirmLabel,
  isRequired,
  onSubmit,
  onCancel,
}: CommentDialogProps) {
  const commentId = useId();
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isEmpty = comment.trim() === '';
  const canSubmit = !isSaving && !(isRequired && isEmpty);

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setIsSaving(true);
    const saved = await onSubmit(isEmpty ? null : comment);
    if (!saved) setIsSaving(false);
  }

  function cancel(): void {
    if (!isSaving) onCancel();
  }

  return (
    <Modal label={title} onClose={cancel}>
      <div className={styles.form}>
        <h2 className={styles.heading}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <div className={fields.field}>
          <label htmlFor={commentId} className={fields.label}>
            {label}
          </label>
          <textarea
            id={commentId}
            value={comment}
            placeholder={placeholder}
            aria-required={isRequired || undefined}
            {...{ [AUTOFOCUS_ATTRIBUTE]: '' }}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (!isPlainEnter(event)) return;
              event.preventDefault();
              void submit();
            }}
          />
        </div>
        <div className={styles.actions}>
          <Button disabled={isSaving} shortcut="cancel" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} shortcut="confirm" onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
