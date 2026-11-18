import { useId, type ReactNode } from 'react';
import styles from './SettingsDialog.module.css';

interface SettingsSectionProps {
  title: string;
  /** A short line under the group, such as what the section is for or why a value can't be saved. */
  note?: ReactNode;
  children: ReactNode;
}

/**
 * One titled section of Settings: a small heading over a rounded group of rows, exposed as a region named by
 * its title.
 */
export function SettingsSection({ title, note, children }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h3 id={headingId} className={styles.heading}>
        {title}
      </h3>
      <div className={styles.group}>{children}</div>
      {note !== undefined && <div className={styles.note}>{note}</div>}
    </section>
  );
}

interface SettingsRowProps {
  label: ReactNode;
  /** The id of the control the label names. Without it, the label is plain text. */
  labelFor?: string;
  description?: ReactNode;
  /** `stacked` puts the control under the label, for wide controls such as a text box. */
  layout?: 'inline' | 'stacked';
  children?: ReactNode;
}

/**
 * One row in a Settings group: its label and description on the left, and its control on the right, or below
 * them when stacked.
 */
export function SettingsRow({ label, labelFor, description, layout = 'inline', children }: SettingsRowProps) {
  return (
    <div className={styles.row} data-layout={layout}>
      <div className={styles.rowText}>
        {labelFor === undefined ? (
          <span className={styles.rowLabel}>{label}</span>
        ) : (
          <label htmlFor={labelFor} className={styles.rowLabel}>
            {label}
          </label>
        )}
        {description !== undefined && <div className={styles.rowDescription}>{description}</div>}
      </div>
      {children !== undefined && <div className={styles.rowControl}>{children}</div>}
    </div>
  );
}
