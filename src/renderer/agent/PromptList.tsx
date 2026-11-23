import { latestVersion, type AgentPromptId, type AgentPromptLibrary } from '../../domain';
import { Button } from '../ui/Button';
import { isDraftDirty, type PromptDraft } from './use-agent-prompts';
import styles from './AgentPromptsDialog.module.css';

interface PromptListProps {
  library: AgentPromptLibrary;
  draft: PromptDraft;
  onSelect: (id: AgentPromptId) => void;
  onNew: () => void;
}

function newDraftName(draft: PromptDraft): string {
  return draft.name.trim() === '' ? draft.base.name : draft.name;
}

/**
 * The Open agent dialog's sidebar: the saved prompts in name order, each with its latest version, the one shown
 * marked as current, and **New prompt** (⌘N). A shown prompt with unsaved changes says Edited, and a new prompt
 * not yet saved sits at the end, saying New.
 */
export function PromptList({ library, draft, onSelect, onNew }: PromptListProps) {
  const isDirty = isDraftDirty(draft);
  return (
    <nav aria-label="Saved prompts" className={styles.sidebar}>
      <h3 className={styles.sectionHeading}>Prompts</h3>
      <ul className={styles.promptList}>
        {library.prompts.map((prompt) => {
          const latest = latestVersion(prompt);
          const isEdited = draft.id === prompt.id && isDirty;
          return (
            <li key={prompt.id}>
              <button
                type="button"
                className={styles.promptButton}
                aria-label={`${latest.name}, ${isEdited ? 'unsaved changes' : `version ${latest.number}`}`}
                aria-current={draft.id === prompt.id ? 'true' : undefined}
                onClick={() => onSelect(prompt.id)}
              >
                <span className={styles.promptName}>{latest.name}</span>
                <span className={styles.promptMeta}>{isEdited ? 'Edited' : `v${latest.number}`}</span>
              </button>
            </li>
          );
        })}
        {draft.id === null && (
          <li>
            <button
              type="button"
              className={styles.promptButton}
              aria-label={`${newDraftName(draft)}, not saved yet`}
              aria-current="true"
            >
              <span className={styles.promptName}>{newDraftName(draft)}</span>
              <span className={styles.promptMeta}>New</span>
            </button>
          </li>
        )}
      </ul>
      <Button shortcut="newPrompt" className={styles.newPrompt} onClick={onNew}>
        New prompt
      </Button>
    </nav>
  );
}
