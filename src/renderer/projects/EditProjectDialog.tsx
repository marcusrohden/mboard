import { useId, useState } from 'react';
import { normaliseProject, type ProjectColour } from '../../domain';
import type { ProjectRename, Task } from '../../shared/contract';
import { useProjectColour } from '../state/project-colours';
import { Button } from '../ui/Button';
import { ColourPicker } from '../ui/ColourPicker';
import { AUTOFOCUS_ATTRIBUTE, Modal } from '../ui/Modal';
import fields from '../ui/fields.module.css';
import { describeImpact, mergeTargetFor, projectImpact, taskCount } from './project-impact';
import styles from './EditProjectDialog.module.css';

interface EditProjectDialogProps {
  project: string;
  tasks: readonly Task[];
  onRename: (from: string, to: string) => Promise<ProjectRename | null>;
  onSetColour: (project: string, colour: ProjectColour | null) => Promise<boolean>;
  onOpenNote: (project: string) => Promise<boolean>;
  onRenamed: (from: string, rename: ProjectRename) => void;
  onClose: () => void;
}

interface MergeConfirmation {
  name: string;
  target: string;
}

/**
 * The Edit project dialog: the project's name and colour, and its note in Obsidian. A new name renames the
 * project on every task, live and archived, without changing their ages. A name another project already has,
 * ignoring case, first asks to merge into it; that project keeps its colour unless a new one is picked here.
 * ⌘↵ saves, ⌘⇧O opens the note, and ⌘. or Esc cancels. The dialog stays open when saving fails.
 */
export function EditProjectDialog({
  project,
  tasks,
  onRename,
  onSetColour,
  onOpenNote,
  onRenamed,
  onClose,
}: EditProjectDialogProps) {
  const nameId = useId();
  const savedColour = useProjectColour(project);
  const [name, setName] = useState(project);
  const [colour, setColour] = useState<ProjectColour | null>(savedColour);
  const [showNameError, setShowNameError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [merge, setMerge] = useState<MergeConfirmation | null>(null);
  const normalisedName = normaliseProject(name);
  const isRenaming = normalisedName !== null && normalisedName !== project;
  const isColourChanged = colour !== savedColour;

  async function save(confirmedMerge = false): Promise<void> {
    if (isSaving) return;
    if (normalisedName === null) {
      setShowNameError(true);
      return;
    }
    const target = isRenaming ? mergeTargetFor(tasks, project, normalisedName) : null;
    if (target !== null && !confirmedMerge) {
      setMerge({ name: normalisedName, target });
      return;
    }
    setIsSaving(true);
    const finalName = isRenaming ? await rename(normalisedName) : project;
    const isSaved = finalName !== null && (!isColourChanged || (await onSetColour(finalName, colour)));
    setIsSaving(false);
    if (isSaved) onClose();
  }

  async function rename(to: string): Promise<string | null> {
    const result = await onRename(project, to);
    if (result === null) return null;
    onRenamed(project, result);
    return result.project;
  }

  if (merge !== null) {
    return (
      <Modal key="merge" role="alertdialog" label={`Merge into ${merge.target}?`} onClose={onClose}>
        <div className={styles.form}>
          <h2 className={styles.heading}>Merge into {merge.target}?</h2>
          <p className={styles.impact}>
            {`${merge.target} already has ${taskCount(projectImpact(tasks, merge.target).total)}. `}
            {`Merging moves ${project}'s tasks into it: ${describeImpact(projectImpact(tasks, project))}. `}
            {`${merge.target} keeps its note${isColourChanged ? ' and takes the colour picked here' : ' and its colour'}, `}
            {`and the note of ${project} moves to the Trash.`}
          </p>
          <div className={styles.actions}>
            <div className={styles.trailing}>
              <Button {...{ [AUTOFOCUS_ATTRIBUTE]: '' }} shortcut="cancel" onClick={() => setMerge(null)}>
                Back
              </Button>
              <Button variant="danger" disabled={isSaving} shortcut="confirm" onClick={() => void save(true)}>
                Merge
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal key="edit" label="Edit project" onClose={onClose}>
      <div className={styles.form}>
        <h2 className={styles.heading}>Edit project</h2>
        <div className={fields.field}>
          <label htmlFor={nameId} className={fields.label}>
            Name
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            aria-required="true"
            aria-invalid={showNameError || undefined}
            aria-describedby={showNameError ? `${nameId}-error` : undefined}
            {...{ [AUTOFOCUS_ATTRIBUTE]: '' }}
            onChange={(event) => {
              setName(event.target.value);
              setShowNameError(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                void save();
              }
            }}
          />
          {showNameError && (
            <p id={`${nameId}-error`} role="alert" className={fields.error}>
              Enter a name for the project.
            </p>
          )}
        </div>
        {isRenaming && (
          <p className={styles.impact} aria-live="polite">
            Renaming changes the project on {describeImpact(projectImpact(tasks, project))}. Each task's history records
            it, and their ages stay as they are.
          </p>
        )}
        <div className={fields.field}>
          <span className={fields.label}>Colour</span>
          <ColourPicker label={`Colour for ${project}`} value={colour} onChange={setColour} />
        </div>
        <div className={styles.actions}>
          <Button shortcut="openProjectNote" onClick={() => void onOpenNote(project)}>
            Open note in Obsidian
          </Button>
          <div className={styles.trailing}>
            <Button shortcut="cancel" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={isSaving} shortcut="confirm" onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
