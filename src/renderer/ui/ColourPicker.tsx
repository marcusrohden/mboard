import { useId } from 'react';
import { PROJECT_COLOURS, type ProjectColour } from '../../domain';
import styles from './project-colours.module.css';

const OPTIONS: ReadonlyArray<ProjectColour | null> = [null, ...PROJECT_COLOURS];

function colourName(colour: ProjectColour | null): string {
  return colour === null ? 'No colour' : `${colour.charAt(0).toUpperCase()}${colour.slice(1)}`;
}

interface ColourPickerProps {
  label: string;
  value: ProjectColour | null;
  onChange: (colour: ProjectColour | null) => void;
  disabled?: boolean;
}

/**
 * A row of project colour swatches, No colour first, as a radio group named `label`. The arrow keys move
 * between swatches, and each swatch is named after its colour.
 */
export function ColourPicker({ label, value, onChange, disabled = false }: ColourPickerProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={styles.picker}>
      {OPTIONS.map((colour) => (
        <label key={colour ?? 'none'} className={styles.option} title={colourName(colour)}>
          <input
            type="radio"
            name={name}
            className="visually-hidden"
            aria-label={colourName(colour)}
            checked={value === colour}
            disabled={disabled}
            onChange={() => onChange(colour)}
          />
          <span className={styles.swatch} data-colour={colour ?? 'none'} aria-hidden="true" />
        </label>
      ))}
    </div>
  );
}
