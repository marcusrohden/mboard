import type { ReactNode } from 'react';
import type { TaskComment } from '../../shared/contract';
import { formatLogTime } from '../lib/format';
import styles from './CommentList.module.css';

interface CommentListProps {
  comments: readonly TaskComment[];
  className?: string;
  /** Replaces each comment's date line, for example with a control that changes it. */
  renderDate?: (comment: TaskComment) => ReactNode;
}

/** A comment's date and time as the comment lists show it. An undated comment shows nothing. */
export function CommentTime({ at }: { at: string }) {
  return at === '' ? null : <time className={styles.time}>{formatLogTime(at)}</time>;
}

/** Comments in the order given, each with its date and time above its text. An undated one shows its text only. */
export function CommentList({ comments, className, renderDate }: CommentListProps) {
  return (
    <ol className={[styles.list, className].filter(Boolean).join(' ')}>
      {comments.map((comment, index) => (
        <li key={`${comment.at}-${index}`} className={styles.comment}>
          {renderDate === undefined ? <CommentTime at={comment.at} /> : renderDate(comment)}
          <p className={styles.text}>{comment.text}</p>
        </li>
      ))}
    </ol>
  );
}
