import { compareArchivedTasks, localDateOf, type Task, type TaskId } from '../../domain';
import { formatDate } from '../lib/format';
import styles from './ArchivedView.module.css';

interface ArchivedViewProps {
  tasks: readonly Task[];
  hasArchivedTasks: boolean;
  onOpen: (id: TaskId) => void;
}

/**
 * The archived view: a table of archived tasks, newest archive first, that replaces the board.
 * A row opens the detail drawer, where the task can be restored.
 */
export function ArchivedView({ tasks, hasArchivedTasks, onOpen }: ArchivedViewProps) {
  const sorted = [...tasks].sort(compareArchivedTasks);
  const emptyText = hasArchivedTasks ? 'No archived tasks match.' : 'No archived tasks.';

  return (
    <div className={styles.view}>
      <table aria-label="Archived tasks" className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Project</th>
            <th scope="col">Responsibility</th>
            <th scope="col">Archived</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((task) => (
            <tr key={task.id} className={styles.row} onClick={() => onOpen(task.id)}>
              <td>
                <button type="button" className={styles.titleButton} onClick={(event) => { event.stopPropagation(); onOpen(task.id); }}>
                  {task.title}
                </button>
              </td>
              <td>{task.project ?? ''}</td>
              <td>
                <span className={styles.badge} data-responsibility={task.responsibility}>
                  {task.responsibility}
                </span>
              </td>
              <td>{task.archivedAt === null ? '' : formatDate(localDateOf(task.archivedAt))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <p className={styles.empty}>{emptyText}</p>}
    </div>
  );
}
