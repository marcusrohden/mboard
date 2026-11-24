import { useState } from 'react';
import { newestCommentsFirst } from '../../domain';
import type { LocalDate, LocalDateTime, TaskComment } from '../../shared/contract';
import { CommentList } from '../comments/CommentList';
import { Button } from '../ui/Button';
import fields from '../ui/fields.module.css';
import { CommentDateField } from './CommentDateField';
import styles from './Drawer.module.css';

interface CommentsSectionProps {
  comments: readonly TaskComment[];
  readOnly: boolean;
  /** When the task was created: no comment can be dated earlier. */
  created: LocalDateTime;
  today: LocalDate;
  onAdd: (text: string) => Promise<boolean>;
  onChangeDate: (comment: TaskComment, at: string) => Promise<boolean>;
}

/**
 * A task's comments, newest first, with a box to add another. Cmd+Enter posts. Each comment's date can be
 * changed, to a time between the task's creation and now. Archived tasks show their comments but don't accept
 * new ones or date changes.
 */
export function CommentsSection({ comments, readOnly, created, today, onAdd, onChangeDate }: CommentsSectionProps) {
  const [draft, setDraft] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const canPost = draft.trim() !== '' && !isPosting;

  async function post(): Promise<void> {
    if (!canPost) return;
    setIsPosting(true);
    const added = await onAdd(draft);
    setIsPosting(false);
    if (added) setDraft('');
  }

  function renderDateField(comment: TaskComment) {
    return (
      <CommentDateField
        comment={comment}
        min={created.slice(0, 16)}
        max={`${today}T23:59`}
        onSave={(at) => onChangeDate(comment, at)}
      />
    );
  }

  return (
    <section aria-label="Comments" className={styles.section}>
      <h3 className={styles.sectionHeading}>Comments</h3>
      {comments.length === 0 ? (
        <p className={styles.muted}>No comments yet.</p>
      ) : (
        <CommentList comments={newestCommentsFirst(comments)} renderDate={readOnly ? undefined : renderDateField} />
      )}
      {!readOnly && (
        <div className={fields.field}>
          <textarea
            aria-label="New comment"
            placeholder="Add a comment"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void post();
              }
            }}
          />
          <div>
            <Button disabled={!canPost} shortcutHint="addComment" onClick={() => void post()}>
              Add comment
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
