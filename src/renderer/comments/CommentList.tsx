import type { TaskComment } from '../../shared/contract';
import { formatLogTime } from '../lib/format';
import styles from './CommentList.module.css';

interface CommentListProps {
  comments: readonly TaskComment[];
  className?: string;
}

/** Comments in the order given, each with its date and time above its text. An undated one shows its text only. */
export function CommentList({ comments, className }: CommentListProps) {
  return (
    <ol className={[styles.list, className].filter(Boolean).join(' ')}>
      {comments.map((comment, index) => (
        <li key={`${comment.at}-${index}`} className={styles.comment}>
          {comment.at !== '' && <time className={styles.time}>{formatLogTime(comment.at)}</time>}
          <p className={styles.text}>{comment.text}</p>
        </li>
      ))}
    </ol>
  );
}
