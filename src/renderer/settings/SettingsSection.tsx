import { useId, type ReactNode } from 'react';
import styles from './SettingsDialog.module.css';

/** One titled section of the Settings dialog, exposed as a region named by its title. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h3 id={headingId} className={styles.heading}>
        {title}
      </h3>
      {children}
    </section>
  );
}
