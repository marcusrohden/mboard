import { useId, useState } from 'react';
import {
  COLUMNS,
  normaliseProject,
  type LocalDate,
  type NewTaskInput,
  type ProjectColour,
  type Status,
} from '../../domain';
import { COLUMN_SHORTCUTS_ARIA, COLUMN_SHORTCUTS_HINT, columnShortcut } from '../shortcuts/keymap';
import { ShortcutHint, useShortcuts } from '../shortcuts/shortcuts';
import { Button } from '../ui/Button';
import { ClearableDateInput } from '../ui/ClearableDateInput';
import { ColourPicker } from '../ui/ColourPicker';
import { AUTOFOCUS_ATTRIBUTE, Modal } from '../ui/Modal';
import { ProjectInput } from '../ui/ProjectInput';
import fields from '../ui/fields.module.css';
import styles from './NewTaskDialog.module.css';

interface NewTaskDialogProps {
  today: LocalDate;
  projectSuggestions: readonly string[];
  onCreate: (input: NewTaskInput) => Promise<boolean>;
  onSetProjectColour: (project: string, colour: ProjectColour) => Promise<boolean>;
  onClose: () => void;
}

/** Lets ⌘1 to ⌘5 pick the column. Rendered inside the dialog, so the keys belong to its layer. */
function ColumnShortcuts({ onPick }: { onPick: (status: Status) => void }) {
  useShortcuts(COLUMNS.map((column, index) => [columnShortcut(index + 1), () => onPick(column)] as const));
  return null;
}

function isNewProject(project: string | null, knownProjects: readonly string[]): project is string {
  if (project === null) return false;
  const wanted = project.toLowerCase();
  return !knownProjects.some((known) => known.toLowerCase() === wanted);
}

/**
 * The New task dialog. Enter in the title, or ⌘↵ anywhere, creates the task, ⌘1 to ⌘5 pick the column, and
 * ⌘. or Esc cancels. The due date starts as today and can be cleared to create a task with none.
 * Typing a project the board doesn't have yet offers a colour for it, saved once the task exists. The
 * dialog stays open if the task can't be created, so nothing typed is lost.
 */
export function NewTaskDialog({
  today,
  projectSuggestions,
  onCreate,
  onSetProjectColour,
  onClose,
}: NewTaskDialogProps) {
  const ids = { title: useId(), status: useId(), project: useId(), due: useId(), description: useId() };
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>('To do');
  const [project, setProject] = useState('');
  const [due, setDue] = useState(today);
  const [description, setDescription] = useState('');
  const [projectColour, setProjectColour] = useState<ProjectColour | null>(null);
  const normalisedProject = normaliseProject(project);
  const offersColour = isNewProject(normalisedProject, projectSuggestions);
  const [showTitleError, setShowTitleError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(): Promise<void> {
    if (isSaving) return;
    if (title.trim() === '') {
      setShowTitleError(true);
      return;
    }
    setIsSaving(true);
    const created = await onCreate({
      title: title.trim(),
      status,
      project: normalisedProject,
      due: due === '' ? null : due,
      description,
    });
    if (created && offersColour && projectColour !== null) await onSetProjectColour(normalisedProject, projectColour);
    setIsSaving(false);
    if (created) onClose();
  }

  return (
    <Modal label="New task" onClose={onClose}>
      <div className={styles.form}>
        <ColumnShortcuts onPick={setStatus} />
        <h2 className={styles.heading}>New task</h2>
        <div className={fields.field}>
          <label htmlFor={ids.title} className={fields.label}>
            Title
          </label>
          <input
            id={ids.title}
            type="text"
            value={title}
            aria-required="true"
            aria-invalid={showTitleError || undefined}
            aria-describedby={showTitleError ? `${ids.title}-error` : undefined}
            {...{ [AUTOFOCUS_ATTRIBUTE]: '' }}
            onChange={(event) => {
              setTitle(event.target.value);
              setShowTitleError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {showTitleError && (
            <p id={`${ids.title}-error`} role="alert" className={fields.error}>
              Enter a title for the task.
            </p>
          )}
        </div>
        <div className={styles.pair}>
          <div className={fields.field}>
            <span className={fields.labelRow}>
              <label htmlFor={ids.status} className={fields.label}>
                Column
              </label>
              <ShortcutHint text={COLUMN_SHORTCUTS_HINT} />
            </span>
            <select
              id={ids.status}
              value={status}
              aria-keyshortcuts={COLUMN_SHORTCUTS_ARIA}
              onChange={(event) => setStatus(event.target.value as Status)}
            >
              {COLUMNS.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.pair}>
          <div className={fields.field}>
            <label htmlFor={ids.project} className={fields.label}>
              Project
            </label>
            <ProjectInput
              id={ids.project}
              suggestions={projectSuggestions}
              value={project}
              onChange={(event) => setProject(event.target.value)}
            />
          </div>
          <div className={fields.field}>
            <label htmlFor={ids.due} className={fields.label}>
              Due date
            </label>
            <ClearableDateInput id={ids.due} value={due} onChange={setDue} clearLabel="Clear due date" />
          </div>
        </div>
        {offersColour && (
          <div className={fields.field}>
            <span className={fields.label}>New project's colour</span>
            <ColourPicker label="New project's colour" value={projectColour} onChange={setProjectColour} />
          </div>
        )}
        <div className={fields.field}>
          <label htmlFor={ids.description} className={fields.label}>
            Description
          </label>
          <textarea id={ids.description} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className={styles.actions}>
          <Button shortcut="cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={isSaving} shortcut="confirm" onClick={() => void submit()}>
            Create task
          </Button>
        </div>
      </div>
    </Modal>
  );
}
