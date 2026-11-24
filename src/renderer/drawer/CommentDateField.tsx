import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TaskComment } from '../../shared/contract';
import { CommentTime } from '../comments/CommentList';
import { Button } from '../ui/Button';
import fields from '../ui/fields.module.css';
import styles from './Drawer.module.css';

interface CommentDateFieldProps {
  comment: TaskComment;
  /** The earliest date and time the input offers, `YYYY-MM-DDTHH:mm`. */
  min: string;
  /** The latest date and time the input offers, `YYYY-MM-DDTHH:mm`. */
  max: string;
  onSave: (at: string) => Promise<boolean>;
}

function toInputValue(logTimestamp: string): string {
  return logTimestamp.replace(' ', 'T');
}

/**
 * A comment's date and time with a Change date button, or Add date for an undated comment. The button swaps
 * them for a date-and-time input with Save date and Cancel; Enter saves too. The input closes once the save
 * succeeds, and stays open with what was entered when it fails.
 */
export function CommentDateField({ comment, min, max, onSave }: CommentDateFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = draft !== null;
  const original = toInputValue(comment.at);
  const canSave = isEditing && draft !== '' && draft !== original && !isSaving;

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  async function save(): Promise<void> {
    if (!canSave) return;
    setIsSaving(true);
    const saved = await onSave(draft);
    setIsSaving(false);
    if (saved) setDraft(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void save();
  }

  if (!isEditing) {
    return (
      <div className={styles.commentDate}>
        <CommentTime at={comment.at} />
        <Button variant="quiet" className={styles.commentDateButton} onClick={() => setDraft(original)}>
          {comment.at === '' ? 'Add date' : 'Change date'}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.commentDate}>
      <input
        ref={inputRef}
        type="datetime-local"
        aria-label="Comment date"
        className={fields.control}
        value={draft}
        min={min}
        max={max}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <Button variant="quiet" disabled={!canSave} onClick={() => void save()}>
        Save date
      </Button>
      <Button variant="quiet" onClick={() => setDraft(null)}>
        Cancel
      </Button>
    </div>
  );
}
