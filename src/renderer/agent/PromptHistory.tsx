import { useId, useState } from 'react';
import { formatCompactDateTime, latestVersion, type AgentPrompt, type AgentPromptVersion } from '../../domain';
import type { LocalDate } from '../../shared/contract';
import { Button } from '../ui/Button';
import { DiffStat, PromptDiff } from './PromptDiff';
import styles from './AgentPromptsDialog.module.css';

interface PromptHistoryProps {
  prompt: AgentPrompt;
  today: LocalDate;
  onRestore: (version: AgentPromptVersion) => void;
}

function changedFrom(prompt: AgentPrompt, version: AgentPromptVersion): AgentPromptVersion | null {
  const index = prompt.versions.indexOf(version);
  return index > 0 ? (prompt.versions[index - 1] ?? null) : null;
}

/**
 * Every saved version of a prompt, newest first, each with when it was saved and how many lines it added and
 * removed. Opening a version shows its change from the version before, as a diff; the newest is open to start
 * with. **Restore this version** (⇧⌘U) puts an earlier version in the editor, and saving it adds it as a new
 * version, so no version is ever lost.
 */
export function PromptHistory({ prompt, today, onRestore }: PromptHistoryProps) {
  const latest = latestVersion(prompt);
  const [openVersion, setOpenVersion] = useState<number | null>(latest.number);
  const baseId = useId();
  const newestFirst = [...prompt.versions].reverse();

  return (
    <div className={styles.history}>
      <p className={styles.note}>
        Restoring puts a version back in the editor. Saving it adds it as the newest version, so no version is lost.
      </p>
      <ol aria-label={`Versions of ${latest.name}`} className={styles.versions}>
        {newestFirst.map((version) => {
          const previous = changedFrom(prompt, version);
          const before = previous ?? { name: version.name, text: '' };
          const isOpen = openVersion === version.number;
          const bodyId = `${baseId}-${version.number}`;
          return (
            <li key={version.number} className={styles.version}>
              <button
                type="button"
                className={styles.versionToggle}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setOpenVersion(isOpen ? null : version.number)}
              >
                <span className={styles.versionName}>Version {version.number}</span>
                {version === latest && <span className={styles.badge}>Current</span>}
                <span className={styles.versionDate}>{formatCompactDateTime(version.savedAt, today)}</span>
                <DiffStat before={before.text} after={version.text} />
              </button>
              {isOpen && (
                <div id={bodyId} className={styles.versionBody}>
                  <PromptDiff
                    before={before}
                    after={version}
                    label={`Changes in version ${version.number}`}
                    sameText={previous === null ? 'Saved with no text.' : 'The text is the same.'}
                  />
                  {version !== latest && (
                    <div>
                      <Button shortcut="restorePromptVersion" onClick={() => onRestore(version)}>
                        Restore this version
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
