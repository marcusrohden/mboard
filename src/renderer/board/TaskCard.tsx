import type { KeyboardEvent, ReactNode } from 'react';
import {
  COLUMNS,
  dueChip,
  formatCompactDate,
  localDateOf,
  stalenessOf,
  type LocalDate,
  type Status,
  type Task,
} from '../../domain';
import { columnShortcut, formatShortcut, type ShortcutId } from '../shortcuts/keymap';
import { shortcutAttributes } from '../shortcuts/shortcuts';
import { useAgeThresholds } from '../state/age-thresholds';
import { TASK_ID_ATTRIBUTE } from '../state/use-task-shortcuts';
import { AgeChip } from '../ui/AgeChip';
import { ArchiveIcon } from '../ui/ArchiveIcon';
import { CheckIcon } from '../ui/CheckIcon';
import { CommentIcon } from '../ui/CommentIcon';
import { ProjectLabel } from '../ui/ProjectLabel';
import { useSortableTask } from './board-dnd';
import styles from './TaskCard.module.css';

interface TaskCardProps {
  task: Task;
  index: number;
  status: Status;
  today: LocalDate;
  onOpen: (id: Task['id']) => void;
  onArchive: (id: Task['id']) => void;
  onComplete: (id: Task['id']) => void;
  onComment: (id: Task['id']) => void;
}

interface CardIconButtonProps {
  label: string;
  tooltip: string;
  shortcut: ShortcutId;
  action: 'comment' | 'complete' | 'archive';
  onPress: () => void;
  children: ReactNode;
}

/**
 * An icon button in a card's top right corner. It names itself for assistive technology and shows its
 * shortcut in its tooltip, because the card has no room for a key hint. Pressing it never opens the drawer.
 */
function CardIconButton({ label, tooltip, shortcut, action, onPress, children }: CardIconButtonProps) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      data-action={action}
      aria-label={label}
      title={`${tooltip} (${formatShortcut(shortcut)})`}
      {...shortcutAttributes(shortcut)}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </button>
  );
}

function describeComments(count: number): string {
  return count === 1 ? '1 comment' : `${count} comments`;
}

type TaskCardActions = Pick<TaskCardProps, 'onArchive' | 'onComplete' | 'onComment'>;

interface TaskCardContentProps extends TaskCardActions {
  task: Task;
  today: LocalDate;
}

const PREVIEW_ACTIONS: TaskCardActions = {
  onArchive: () => undefined,
  onComplete: () => undefined,
  onComment: () => undefined,
};

/**
 * One task on the board: title, project in its colour, then the due, created and updated dates on lines of their
 * own. A due date that is today or overdue gets a coloured chip, and the updated date the age chip, whose
 * staleness tier also colours the left edge. The top right corner always shows two icon buttons: a speech bubble
 * with the comment count, which adds a comment, and a tick that completes the task (moving it to Done after the
 * move comment), or, in Done, an archive box. The whole card is the drag handle; while it is dragged it stays in
 * its list as an empty slot showing where it will land. Clicking it, or pressing Enter on it, opens the detail
 * drawer, and the task shortcuts act on it while it has focus.
 */
export function TaskCard({ task, index, status, today, onOpen, onArchive, onComplete, onComment }: TaskCardProps) {
  const { ref, isDragSource } = useSortableTask(task.id, index, status);
  const staleness = stalenessOf(task, today, useAgeThresholds());

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Enter' && event.target === event.currentTarget) {
      event.preventDefault();
      onOpen(task.id);
    }
  }

  return (
    <article
      ref={ref}
      role="article"
      aria-label={task.title}
      tabIndex={0}
      {...{ [TASK_ID_ATTRIBUTE]: task.id }}
      className={styles.card}
      data-staleness={staleness.level}
      data-drag-source={isDragSource || undefined}
      onClick={() => onOpen(task.id)}
      onKeyDown={handleKeyDown}
    >
      <TaskCardContent task={task} today={today} onArchive={onArchive} onComplete={onComplete} onComment={onComment} />
    </article>
  );
}

/**
 * The copy of a task card that follows the pointer while the task is dragged. It looks like the card, but it is
 * inert and hidden from assistive technology, and it carries no task id, so focus, shortcuts and queries only
 * ever find the real card.
 */
export function TaskCardPreview({ task, today }: Pick<TaskCardContentProps, 'task' | 'today'>) {
  const staleness = stalenessOf(task, today, useAgeThresholds());
  return (
    <div className={`${styles.card} ${styles.preview}`} data-staleness={staleness.level} aria-hidden inert>
      <TaskCardContent task={task} today={today} {...PREVIEW_ACTIONS} />
    </div>
  );
}

function TaskCardContent({ task, today, onArchive, onComplete, onComment }: TaskCardContentProps) {
  const due = dueChip(task, today);
  const commentCount = task.comments.length;
  const comments = describeComments(commentCount);

  return (
    <>
      <div className={styles.top}>
        <p className={styles.title}>{task.title}</p>
        <div className={styles.actions}>
          <CardIconButton
            label={commentCount === 0 ? 'Add comment' : `Add comment, ${comments}`}
            tooltip={commentCount === 0 ? 'Add comment' : `${comments} · Add comment`}
            shortcut="commentOnTask"
            action="comment"
            onPress={() => onComment(task.id)}
          >
            <CommentIcon />
            {commentCount > 0 && <span className={styles.count}>{commentCount}</span>}
          </CardIconButton>
          {task.status === 'Done' ? (
            <CardIconButton
              label="Archive"
              tooltip="Archive"
              shortcut="archiveTask"
              action="archive"
              onPress={() => onArchive(task.id)}
            >
              <ArchiveIcon />
            </CardIconButton>
          ) : (
            <CardIconButton
              label="Complete"
              tooltip="Complete"
              shortcut={columnShortcut(COLUMNS.indexOf('Done') + 1)}
              action="complete"
              onPress={() => onComplete(task.id)}
            >
              <CheckIcon />
            </CardIconButton>
          )}
        </div>
      </div>
      {task.project !== null && (
        <p className={styles.project}>
          <ProjectLabel project={task.project} />
        </p>
      )}
      <div className={styles.dates}>
        {task.due !== null && (
          <div className={styles.dateLine}>
            <span>Due {formatCompactDate(task.due, today)}</span>
            {due !== null && due.tone !== 'neutral' && (
              <span className={styles.chip} data-tone={due.tone}>
                {due.text}
              </span>
            )}
          </div>
        )}
        <div className={styles.dateLine}>
          <span>Created {formatCompactDate(localDateOf(task.created), today)}</span>
        </div>
        <div className={styles.dateLine}>
          <span>Updated {formatCompactDate(localDateOf(task.updated), today)}</span>
          <AgeChip task={task} today={today} />
        </div>
      </div>
    </>
  );
}
