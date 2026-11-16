import { useId, useState } from 'react';
import type { HistoryEntry } from '../../shared/contract';
import { formatLogTime } from '../lib/format';
import { Button } from '../ui/Button';
import styles from './Drawer.module.css';

/**
 * A task's history log behind a "History" disclosure button, newest entry first.
 */
export function HistorySection({ entries }: { entries: readonly HistoryEntry[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const listId = useId();
  const newestFirst = [...entries].reverse();

  return (
    <section className={styles.section}>
      <Button variant="quiet" aria-expanded={isOpen} aria-controls={listId} onClick={() => setIsOpen((open) => !open)}>
        History
      </Button>
      {isOpen && (
        <ul id={listId} aria-label="History entries" className={styles.list}>
          {newestFirst.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className={styles.muted}>{formatLogTime(entry.at)}</span> {entry.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
