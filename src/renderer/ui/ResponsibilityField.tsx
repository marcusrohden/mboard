import { useId } from 'react';
import { RESPONSIBILITIES, type Responsibility } from '../../domain';
import styles from './ResponsibilityField.module.css';

interface ResponsibilityFieldProps {
  value: Responsibility;
  onChange: (value: Responsibility) => void;
  disabled?: boolean;
}

/**
 * A segmented control for choosing who has to take the next step, exposed as a radio group named "Responsibility".
 */
export function ResponsibilityField({ value, onChange, disabled = false }: ResponsibilityFieldProps) {
  const groupName = useId();
  return (
    <div role="radiogroup" aria-label="Responsibility" className={styles.group}>
      {RESPONSIBILITIES.map((option) => (
        <label key={option} className={styles.segment} data-responsibility={option}>
          <input
            type="radio"
            name={groupName}
            value={option}
            checked={value === option}
            disabled={disabled}
            className={styles.input}
            onChange={() => onChange(option)}
          />
          <span className={styles.label}>{option}</span>
        </label>
      ))}
    </div>
  );
}
