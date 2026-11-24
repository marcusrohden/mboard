import { useId, useState, type KeyboardEvent } from 'react';
import type { TaskComment } from '../../shared/contract';
import { MarkdownTextArea } from '../markdown/MarkdownTextArea';
import { Button } from '../ui/Button';
import { AUTOFOCUS_ATTRIBUTE, Modal } from '../ui/Modal';
import fields from '../ui/fields.module.css';
import styles from './CommentDialog.module.css';
import { CommentList } from './CommentList';

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
  /** The task's comments so far, listed under the buttons in the order given. Nothing is shown when there are none. */
  previousComments?: readonly TaskComment[];
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
 * The dialog stays open while the comment is saved, and if saving fails, so nothing typed is lost. Any
 * `previousComments` are listed under the buttons, in a list that scrolls on its own.
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
  previousComments = [],
}: CommentDialogProps) {
  const commentId = useId();
  const previousHeadingId = useId();
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
          <MarkdownTextArea
            id={commentId}
            label={label}
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
        {previousComments.length > 0 && (
          <section aria-labelledby={previousHeadingId} className={styles.previous}>
            <h3 id={previousHeadingId} className={styles.previousHeading}>
              Previous comments
            </h3>
            <CommentList comments={previousComments} className={styles.previousList} />
          </section>
        )}
      </div>
    </Modal>
  );
}
