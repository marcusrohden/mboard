import { useId, useState } from 'react';
import type { UnreadableFile } from '../../shared/contract';
import { Button } from '../ui/Button';
import styles from './Notices.module.css';

/**
 * Says how many task files couldn't be read, and expands to list each file's path and reason.
 * Renders nothing when every file could be read.
 */
export function UnreadableNotice({ files }: { files: readonly UnreadableFile[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  if (files.length === 0) return null;
  const summary = files.length === 1 ? "1 file couldn't be read" : `${files.length} files couldn't be read`;

  return (
    <div className={styles.notice}>
      <div className={styles.noticeRow}>
        <span role="status">{summary}</span>
        <Button variant="quiet" aria-expanded={isExpanded} aria-controls={detailsId} onClick={() => setIsExpanded((open) => !open)}>
          {isExpanded ? 'Hide details' : 'Show details'}
        </Button>
      </div>
      {isExpanded && (
        <ul id={detailsId} className={styles.details}>
          {files.map((file) => (
            <li key={file.id}>
              <code>{file.id}</code>
              <span className={styles.reason}>{file.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
