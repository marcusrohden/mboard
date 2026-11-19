import { useId, useRef, useState, type ReactNode } from 'react';
import { COLUMNS, normaliseProject, type LocalDate, type Status, type Task } from '../../domain';
import { formatDateTime } from '../lib/format';
import type { TaskCommands } from '../state/use-task-commands';
import { AgeChip } from '../ui/AgeChip';
import { Button } from '../ui/Button';
import { COLUMN_SHORTCUTS_ARIA, COLUMN_SHORTCUTS_HINT, columnShortcut } from '../shortcuts/keymap';
import { ShortcutHint } from '../shortcuts/shortcuts';
import { CloseIcon } from '../ui/CloseIcon';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import fields from '../ui/fields.module.css';
import { useLightDismiss } from '../ui/use-light-dismiss';
import { CommentsSection } from './CommentsSection';
import { DrawerField } from './DrawerField';
import { HistorySection } from './HistorySection';
import { ProjectColourField } from './ProjectColourField';
import { PendingFieldSavesContext, usePendingFieldSaves, type PendingFieldSaves } from './pending-field-saves';
import { useDrawerFocus } from './use-drawer-focus';
import styles from './Drawer.module.css';

interface TaskDrawerProps {
  task: Task;
  today: LocalDate;
  projectSuggestions: readonly string[];
  commands: TaskCommands;
  onClose: () => void;
}

/**
 * The task detail drawer, laid over the right of the board or the archived list, neither of which narrows to make room.
 * It takes keyboard focus while open and gives it back on close. Fields save as they are edited and
 * refresh from new snapshots, except the one being edited. Under the project, its colour can be picked. Save commits the field still being edited and
 * closes the drawer once that save succeeds. The close button, Esc, or a press on the page outside the
 * drawer closes it without saving that field. An archived task is read-only apart from its project and its
 * project's colour, Restore and Delete.
 */
export function TaskDrawer(props: TaskDrawerProps) {
  const pendingSaves = usePendingFieldSaves();
  return (
    <PendingFieldSavesContext value={pendingSaves}>
      <TaskDrawerPanel {...props} pendingSaves={pendingSaves} />
    </PendingFieldSavesContext>
  );
}

function TaskDrawerPanel({
  task,
  today,
  projectSuggestions,
  commands,
  onClose,
  pendingSaves,
}: TaskDrawerProps & { pendingSaves: PendingFieldSaves }) {
  const statusId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const readOnly = task.isArchived;

  function closeWithoutSaving(): void {
    pendingSaves.discardAll();
    onClose();
  }

  useLightDismiss(panelRef, closeWithoutSaving);
  useDrawerFocus(panelRef, task.created);

  async function saveAndClose(): Promise<void> {
    if (await pendingSaves.commitAll()) onClose();
  }

  async function saveTitle(next: string): Promise<boolean> {
    return next.trim() === '' ? true : commands.edit(task.id, { field: 'title', value: next });
  }

  function changeStatus(status: Status): void {
    void commands.moveToTopOf(task.id, status);
  }

  function renderProjectColour(project: string | null): ReactNode {
    if (project === null) return null;
    return (
      <ProjectColourField project={project} onChange={(name, colour) => void commands.setProjectColour(name, colour)} />
    );
  }

  async function confirmDelete(): Promise<void> {
    setIsConfirmingDelete(false);
    await commands.remove(task.id);
  }

  return (
    <aside ref={panelRef} aria-label="Task details" tabIndex={-1} className={styles.drawer}>
      <div key={task.created} className={styles.content}>
        <div className={styles.top}>
          <Button
            variant="quiet"
            className={styles.iconButton}
            aria-label="Close without saving"
            title="Close without saving"
            shortcut="closeTask"
            onMouseDown={(event) => event.preventDefault()}
            onClick={closeWithoutSaving}
          >
            <CloseIcon />
          </Button>
          <DrawerField label="Title" kind="text" isHeading value={task.title} readOnly={readOnly} onSave={saveTitle} />
          <Button variant="quiet" shortcut="saveTask" onClick={() => void saveAndClose()}>
            Save
          </Button>
        </div>
        <div className={styles.pair}>
          <div className={fields.field}>
            <span className={fields.labelRow}>
              <label htmlFor={statusId} className={fields.label}>
                Column
              </label>
              <ShortcutHint text={COLUMN_SHORTCUTS_HINT} />
            </span>
            <select
              id={statusId}
              value={task.status}
              disabled={readOnly}
              aria-keyshortcuts={COLUMN_SHORTCUTS_ARIA}
              onChange={(event) => changeStatus(event.target.value as Status)}
            >
              {COLUMNS.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </div>
          <DrawerField
            label="Due date"
            kind="date"
            value={task.due ?? ''}
            readOnly={readOnly}
            onSave={(next) => commands.edit(task.id, { field: 'due', value: next === '' ? null : next })}
          />
        </div>
        <DrawerField
          label="Project"
          kind="project"
          value={task.project ?? ''}
          readOnly={false}
          suggestions={projectSuggestions}
          onSave={(next) => commands.edit(task.id, { field: 'project', value: next === '' ? null : next })}
          renderBelow={(displayed) => renderProjectColour(normaliseProject(displayed))}
        />
        <DrawerField
          label="Description"
          kind="textarea"
          value={task.description}
          readOnly={readOnly}
          onSave={(next) => commands.edit(task.id, { field: 'description', value: next })}
        />
        <dl className={styles.times}>
          <dt>Created</dt>
          <dd>{formatDateTime(task.created)}</dd>
          <dt>Updated</dt>
          <dd className={styles.updated}>
            <time dateTime={task.updated}>{formatDateTime(task.updated)}</time>
            <AgeChip task={task} today={today} />
          </dd>
          {task.archivedAt !== null && (
            <>
              <dt>Archived</dt>
              <dd>{formatDateTime(task.archivedAt)}</dd>
            </>
          )}
        </dl>
        <div className={styles.actions}>
          {!readOnly && task.status !== 'Done' && (
            <Button
              variant="primary"
              shortcutHint={columnShortcut(COLUMNS.length)}
              onClick={() => void commands.moveToTopOf(task.id, 'Done')}
            >
              Mark complete
            </Button>
          )}
          {!readOnly && task.status === 'Done' && (
            <Button shortcutHint="archiveTask" onClick={() => void commands.archive(task.id)}>
              Archive
            </Button>
          )}
          {readOnly && (
            <Button shortcutHint="restoreTask" onClick={() => void commands.restore(task.id)}>
              Restore
            </Button>
          )}
          <Button shortcutHint="openInObsidian" onClick={() => void commands.openInObsidian(task.id)}>
            Open in Obsidian
          </Button>
          <Button variant="danger" shortcut="deleteTask" onClick={() => setIsConfirmingDelete(true)}>
            Delete
          </Button>
        </div>
        <CommentsSection
          comments={task.comments}
          readOnly={readOnly}
          onAdd={(text) => commands.addComment(task.id, text)}
        />
        <HistorySection
          task={task}
          today={today}
          onRevert={(toEntryIndex, expected) => commands.revert(task.id, toEntryIndex, expected)}
        />
      </div>
      {isConfirmingDelete && (
        <ConfirmDialog
          title="Delete task?"
          message={`"${task.title}" will be moved to the Trash.`}
          confirmLabel="Delete"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setIsConfirmingDelete(false)}
        />
      )}
    </aside>
  );
}
