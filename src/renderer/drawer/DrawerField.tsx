import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { SHORTCUTS, matchesChord } from '../shortcuts/keymap';
import { Button } from '../ui/Button';
import { ProjectInput } from '../ui/ProjectInput';
import fields from '../ui/fields.module.css';
import { useFieldRegistration } from './pending-field-saves';
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
  renderBelow?: (displayed: string) => ReactNode;
}

/**
 * One inline-editable field in the detail drawer. It saves on blur or Enter (Cmd+Enter for the
 * description), and a date can be removed with its own button or ⌘⌫. Esc reaches the drawer, which closes
 * without saving the edit. When `readOnly` the value is shown but can't be changed. `renderBelow` adds
 * controls under the input that follow the value as shown, draft included.
 */
export function DrawerField({
  label,
  kind,
  value,
  onSave,
  readOnly,
  suggestions = [],
  isHeading = false,
  renderBelow,
}: DrawerFieldProps) {
  const id = useId();
  const editable = useEditableValue(value, onSave);
  useFieldRegistration(editable);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    if (kind === 'date' && !readOnly && matchesChord(SHORTCUTS.removeDueDate.chord, event)) {
      event.preventDefault();
      void editable.commit('');
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
              shortcutHint="removeDueDate"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void editable.commit('')}
            >
              Remove
            </Button>
          )}
        </div>
      )}
      {renderBelow?.(editable.displayed)}
    </div>
  );
}
