import { useMemo } from 'react';
import {
  diffHunks,
  diffLines,
  formatHunkHeader,
  summariseDiff,
  type AgentPromptDraft,
  type DiffLineKind,
} from '../../domain';
import styles from './AgentPromptsDialog.module.css';

const SIGNS: Readonly<Record<DiffLineKind, string>> = { unchanged: ' ', added: '+', removed: '−' };
const SPOKEN: Readonly<Record<DiffLineKind, string>> = { unchanged: '', added: 'Added: ', removed: 'Removed: ' };

interface PromptDiffProps {
  before: AgentPromptDraft;
  after: AgentPromptDraft;
  label: string;
  /** What to say when the text is the same on both sides. */
  sameText?: string;
}

/**
 * What changed between two states of a prompt, the way `git diff` shows it: a rename as the old and new names,
 * then each hunk of the text under its `@@` header, with three unchanged lines around each change. Removed lines
 * are red and marked `−`, added lines green and marked `+`, and each line shows its number before and after.
 */
export function PromptDiff({ before, after, label, sameText = 'The text is the same.' }: PromptDiffProps) {
  const hunks = useMemo(() => diffHunks(diffLines(before.text, after.text)), [before.text, after.text]);
  const isRenamed = before.name !== after.name;

  return (
    <div role="group" aria-label={label} className={styles.diff}>
      {isRenamed && (
        <p className={styles.rename}>
          Renamed from “{before.name}” to “{after.name}”
        </p>
      )}
      {hunks.length === 0 && <p className={styles.sameText}>{sameText}</p>}
      {hunks.map((hunk) => (
        <div key={`${hunk.beforeStart}:${hunk.afterStart}`} className={styles.hunk}>
          <div className={styles.hunkHeader}>{formatHunkHeader(hunk)}</div>
          {hunk.lines.map((line) => (
            <div key={`${line.before ?? '-'}:${line.after ?? '-'}`} className={styles.line} data-kind={line.kind}>
              <span className={styles.lineNumber} aria-hidden="true">
                {line.before ?? ''}
              </span>
              <span className={styles.lineNumber} aria-hidden="true">
                {line.after ?? ''}
              </span>
              <span className={styles.sign} aria-hidden="true">
                {SIGNS[line.kind]}
              </span>
              <span className={styles.lineText}>
                {SPOKEN[line.kind] !== '' && <span className="visually-hidden">{SPOKEN[line.kind]}</span>}
                {line.text}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** How many lines a change adds and removes, as `+3 −1`, read out in words. */
export function DiffStat({ before, after }: { before: string; after: string }) {
  const { added, removed } = useMemo(() => summariseDiff(diffLines(before, after)), [before, after]);
  const lines = (count: number): string => `${count} ${count === 1 ? 'line' : 'lines'}`;
  return (
    <span className={styles.diffStat} aria-label={`${lines(added)} added, ${lines(removed)} removed`}>
      <span className={styles.statAdded}>+{added}</span> <span className={styles.statRemoved}>−{removed}</span>
    </span>
  );
}
