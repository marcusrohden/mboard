import { useId, useState } from 'react';
import { formatCompactDateTime, revertBlocker, revertExpectationFor, type RevertBlocker } from '../../domain';
import type { LocalDate, RevertExpectation, Task } from '../../shared/contract';
import { formatLogTime } from '../lib/format';
import { useShortcut } from '../shortcuts/shortcuts';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import styles from './Drawer.module.css';

interface HistorySectionProps {
  task: Task;
  today: LocalDate;
  onRevert: (toEntryIndex: number, expected: RevertExpectation) => Promise<boolean>;
}

interface PendingRevert {
  index: number;
  expected: RevertExpectation;
}

const ARCHIVED_NOTE = 'Restore the task to revert it to an earlier entry.';
const REVERT_ENTRY_ATTRIBUTE = 'data-revert-entry';

function pressFocusedRevertButton(): void {
  const focused = document.activeElement;
  if (focused instanceof HTMLButtonElement && focused.hasAttribute(REVERT_ENTRY_ATTRIBUTE)) focused.click();
}

const ENTRY_NOTES: Partial<Record<RevertBlocker, string>> = {
  beforeLedger: "Can't revert this far back: a later change was made before mboard kept a ledger.",
  undated: "Can't revert to an undated entry.",
  archivedThen: "Can't revert to here: the task was archived at that point.",
};

function changeCount(count: number): string {
  return `The ${count} ${count === 1 ? 'change' : 'changes'} made after that will be removed from the task and its history.`;
}

function revertMessage(task: Task, pending: PendingRevert, today: LocalDate): string {
  const point = formatCompactDateTime(pending.expected.at, today);
  const discarded = pending.expected.historyLength - 1 - pending.index;
  return `“${task.title}” will go back to how it was at ${point}. ${changeCount(discarded)}`;
}

function notesWithLedgerReasonOnce(blockers: readonly (RevertBlocker | null)[]): (string | null)[] {
  let hasLedgerNote = false;
  return blockers.map((blocker) => {
    if (blocker !== 'beforeLedger') return blocker === null ? null : (ENTRY_NOTES[blocker] ?? null);
    if (hasLedgerNote) return null;
    hasLedgerNote = true;
    return ENTRY_NOTES.beforeLedger ?? null;
  });
}

/**
 * A task's history log behind a "History" disclosure button, newest entry first. Every entry the task
 * can be reverted to has a Revert to here button, which asks for confirmation first. Entries that can't
 * be reverted to say briefly why, and an archived task asks to be restored first. ⇧⌘H shows or hides the
 * log, and ⇧⌘U presses the Revert to here button that has focus.
 */
export function HistorySection({ task, today, onRevert }: HistorySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<PendingRevert | null>(null);
  useShortcut('revertToHere', pressFocusedRevertButton, isOpen);
  const listId = useId();
  const newestFirst = task.history.map((entry, index) => ({ entry, index })).reverse();
  const blockers = newestFirst.map(({ index }) => revertBlocker(task, index));
  const notes = notesWithLedgerReasonOnce(blockers);

  async function confirmRevert(revert: PendingRevert): Promise<void> {
    setPending(null);
    await onRevert(revert.index, revert.expected);
  }

  return (
    <section className={styles.section}>
      <Button
        variant="quiet"
        aria-expanded={isOpen}
        aria-controls={listId}
        shortcut="toggleHistory"
        onClick={() => setIsOpen((open) => !open)}
      >
        History
      </Button>
      {isOpen && task.isArchived && task.history.length > 1 && <p className={styles.muted}>{ARCHIVED_NOTE}</p>}
      {isOpen && (
        <ul id={listId} aria-label="History entries" className={styles.list}>
          {newestFirst.map(({ entry, index }, position) => (
            <li key={`${entry.at}-${index}`} className={styles.historyEntry}>
              <span className={styles.historyText}>
                <span className={styles.muted}>{formatLogTime(entry.at)}</span> {entry.text}
              </span>
              {blockers[position] === null && (
                <Button
                  variant="quiet"
                  shortcutHint="revertToHere"
                  {...{ [REVERT_ENTRY_ATTRIBUTE]: '' }}
                  onClick={() => setPending({ index, expected: revertExpectationFor(task.history, index) })}
                >
                  Revert to here
                </Button>
              )}
              {notes[position] !== null && <span className={styles.revertNote}>{notes[position]}</span>}
            </li>
          ))}
        </ul>
      )}
      {pending !== null && (
        <ConfirmDialog
          title="Revert task?"
          message={revertMessage(task, pending, today)}
          confirmLabel="Revert"
          onConfirm={() => void confirmRevert(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
