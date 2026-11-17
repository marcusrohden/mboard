import { useId, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { ProjectInput } from '../ui/ProjectInput';
import fields from '../ui/fields.module.css';
import { useFieldCommitRegistration } from './pending-field-saves';
import { useEditableValue } from './use-editable-value';
import styles from './Drawer.module.css';

export type DrawerFieldKind = 'text' | 'project' | 'date' | 'textarea';

interface DrawerFieldProps {
  label: string;
  kind: DrawerFieldKind;
  value: string;
  onSave: (next: string) => Promise<boolean>;
  readOnly: boolean;
  suggestions?: readonly string[];
  isHeading?: boolean;
}

/**
 * One inline-editable field in the detail drawer. It saves on blur or Enter (Cmd+Enter for the
 * description), Esc abandons the edit, and a date can be removed with its own button. When `readOnly`
 * the value is shown but can't be changed.
 */
export function DrawerField({
  label,
  kind,
  value,
  onSave,
  readOnly,
  suggestions = [],
  isHeading = false,
}: DrawerFieldProps) {
  const id = useId();
  const editable = useEditableValue(value, onSave);
  useFieldCommitRegistration(editable.commit);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      editable.cancel();
      event.currentTarget.blur();
      return;
    }
    const isSubmit =
      kind === 'textarea' ? event.key === 'Enter' && (event.metaKey || event.ctrlKey) : event.key === 'Enter';
    if (isSubmit) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  const shared = {
    id,
    value: editable.displayed,
    readOnly,
    onFocus: editable.begin,
    onBlur: () => void editable.commit(),
    onKeyDown: handleKeyDown,
  };

  return (
    <div className={fields.field}>
      <label htmlFor={id} className={isHeading ? 'visually-hidden' : fields.label}>
        {label}
      </label>
      {kind === 'textarea' && <textarea {...shared} onChange={(event) => editable.change(event.target.value)} />}
      {kind === 'text' && (
        <input
          type="text"
          {...shared}
          className={isHeading ? styles.titleInput : undefined}
          onChange={(event) => editable.change(event.target.value)}
        />
      )}
      {kind === 'project' && (
        <ProjectInput suggestions={suggestions} {...shared} onChange={(event) => editable.change(event.target.value)} />
      )}
      {kind === 'date' && (
        <div className={fields.row}>
          <input
            type="date"
            {...shared}
            onChange={(event) => {
              editable.change(event.target.value);
              if (event.target.value !== '') void editable.commit(event.target.value);
            }}
          />
          {!readOnly && editable.displayed !== '' && (
            <Button
              variant="quiet"
              aria-label="Remove due date"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void editable.commit('')}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
