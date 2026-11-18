import { useState } from 'react';
import type { TaskComment } from '../../shared/contract';
import { CommentList } from '../comments/CommentList';
import { Button } from '../ui/Button';
import fields from '../ui/fields.module.css';
import styles from './Drawer.module.css';

interface CommentsSectionProps {
  comments: readonly TaskComment[];
  readOnly: boolean;
  onAdd: (text: string) => Promise<boolean>;
}

/**
 * A task's comments, oldest first, with a box to add another. Cmd+Enter posts. Archived tasks show their
 * comments but don't accept new ones.
 */
export function CommentsSection({ comments, readOnly, onAdd }: CommentsSectionProps) {
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

  return (
    <section aria-label="Comments" className={styles.section}>
      <h3 className={styles.sectionHeading}>Comments</h3>
      {comments.length === 0 ? <p className={styles.muted}>No comments yet.</p> : <CommentList comments={comments} />}
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
