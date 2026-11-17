import { useId, useState, type KeyboardEvent } from 'react';
import { COLUMNS, normaliseProject, type NewTaskInput, type Status } from '../../domain';
import { Button } from '../ui/Button';
import { AUTOFOCUS_ATTRIBUTE, Modal } from '../ui/Modal';
import { ProjectInput } from '../ui/ProjectInput';
import fields from '../ui/fields.module.css';
import styles from './NewTaskDialog.module.css';

interface NewTaskDialogProps {
  projectSuggestions: readonly string[];
  onCreate: (input: NewTaskInput) => Promise<boolean>;
  onClose: () => void;
}

/**
 * The New task dialog. Enter in the title, or Cmd+Enter anywhere, creates the task, and Esc cancels.
 * The dialog stays open if the task can't be created, so nothing typed is lost.
 */
export function NewTaskDialog({ projectSuggestions, onCreate, onClose }: NewTaskDialogProps) {
  const ids = { title: useId(), status: useId(), project: useId(), due: useId(), description: useId() };
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>('To do');
  const [project, setProject] = useState('');
  const [due, setDue] = useState('');
  const [description, setDescription] = useState('');
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
      project: normaliseProject(project),
      due: due === '' ? null : due,
      description,
    });
    setIsSaving(false);
    if (created) onClose();
  }

  function submitOnCommandEnter(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <Modal label="New task" onClose={onClose}>
      <div className={styles.form} onKeyDown={submitOnCommandEnter}>
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
            <label htmlFor={ids.status} className={fields.label}>
              Column
            </label>
            <select id={ids.status} value={status} onChange={(event) => setStatus(event.target.value as Status)}>
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
            <input id={ids.due} type="date" value={due} onChange={(event) => setDue(event.target.value)} />
          </div>
        </div>
        <div className={fields.field}>
          <label htmlFor={ids.description} className={fields.label}>
            Description
          </label>
          <textarea id={ids.description} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className={styles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={isSaving} onClick={() => void submit()}>
            Create task
          </Button>
        </div>
      </div>
    </Modal>
  );
}
