import { useId, useState, type KeyboardEvent } from 'react';
import { COLUMNS, normaliseProject, type NewTaskInput, type ProjectColour, type Status } from '../../domain';
import { Button } from '../ui/Button';
import { ColourPicker } from '../ui/ColourPicker';
import { AUTOFOCUS_ATTRIBUTE, Modal } from '../ui/Modal';
import { ProjectInput } from '../ui/ProjectInput';
import fields from '../ui/fields.module.css';
import styles from './NewTaskDialog.module.css';

interface NewTaskDialogProps {
  projectSuggestions: readonly string[];
  onCreate: (input: NewTaskInput) => Promise<boolean>;
  onSetProjectColour: (project: string, colour: ProjectColour) => Promise<boolean>;
  onClose: () => void;
}

function isNewProject(project: string | null, knownProjects: readonly string[]): project is string {
  if (project === null) return false;
  const wanted = project.toLowerCase();
  return !knownProjects.some((known) => known.toLowerCase() === wanted);
}

/**
 * The New task dialog. Enter in the title, or Cmd+Enter anywhere, creates the task, and Esc cancels.
 * Typing a project the board doesn't have yet offers a colour for it, saved once the task exists. The
 * dialog stays open if the task can't be created, so nothing typed is lost.
 */
export function NewTaskDialog({ projectSuggestions, onCreate, onSetProjectColour, onClose }: NewTaskDialogProps) {
  const ids = { title: useId(), status: useId(), project: useId(), due: useId(), description: useId() };
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>('To do');
  const [project, setProject] = useState('');
  const [due, setDue] = useState('');
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
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={isSaving} onClick={() => void submit()}>
            Create task
          </Button>
        </div>
      </div>
    </Modal>
  );
}
