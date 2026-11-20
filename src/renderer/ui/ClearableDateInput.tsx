import type { KeyboardEvent } from 'react';
import { SHORTCUTS, formatShortcut, matchesChord } from '../shortcuts/keymap';
import { shortcutAttributes } from '../shortcuts/shortcuts';
import { Button } from './Button';
import { CloseIcon } from './CloseIcon';
import styles from './ClearableDateInput.module.css';

interface ClearableDateInputProps {
  id: string;
  value: string;
  onChange: (next: string) => void;
  /** The clear button's accessible name and tooltip, such as "Clear due date". */
  clearLabel: string;
}

/**
 * A date input and its clear button, framed together in one box so the button reads as belonging to the
 * date. The button, or ⌘⌫ in the input, empties the value. The button is disabled while there is no date.
 */
export function ClearableDateInput({ id, value, onChange, clearLabel }: ClearableDateInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!matchesChord(SHORTCUTS.removeDueDate.chord, event)) return;
    event.preventDefault();
    onChange('');
  }

  return (
    <div className={styles.box}>
      <input
        id={id}
        type="date"
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <Button
        variant="quiet"
        className={styles.clear}
        aria-label={clearLabel}
        title={`${clearLabel} (${formatShortcut('removeDueDate')})`}
        disabled={value === ''}
        {...shortcutAttributes('removeDueDate')}
        onClick={() => onChange('')}
      >
        <CloseIcon />
      </Button>
    </div>
  );
}
