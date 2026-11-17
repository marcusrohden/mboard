import { CommentIcon } from '../ui/CommentIcon';
import styles from './TaskCard.module.css';

interface CommentCountProps {
  count: number;
}

function describeComments(count: number): string {
  return count === 1 ? '1 comment' : `${count} comments`;
}

/**
 * A speech bubble with how many comments a task has, for its card. Shows nothing when there are none. Its
 * tooltip and accessible text say the count in words, for example `3 comments`.
 */
export function CommentCount({ count }: CommentCountProps) {
  if (count <= 0) return null;
  const description = describeComments(count);
  return (
    <span className={styles.comments} title={description}>
      <CommentIcon />
      <span aria-hidden="true">{count}</span>
      <span className="visually-hidden">{description}</span>
    </span>
  );
}
