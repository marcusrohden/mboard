import { useId, type Ref } from 'react';
import { normaliseAgentPromptDraft, type AgentPromptDraft } from '../../domain';
import { AUTOFOCUS_ATTRIBUTE } from '../ui/Modal';
import fields from '../ui/fields.module.css';
import { PromptDiff } from './PromptDiff';
import { isDraftDirty, type PromptDraft } from './use-agent-prompts';
import styles from './AgentPromptsDialog.module.css';

interface PromptEditorProps {
  draft: PromptDraft;
  /** The version a save would add. */
  nextVersion: number;
  problem: string | null;
  nameRef: Ref<HTMLInputElement>;
  textRef: Ref<HTMLTextAreaElement>;
  onChange: (patch: Partial<AgentPromptDraft>) => void;
}

/**
 * The prompt's name and text, and, while they differ from the saved prompt, its unsaved changes as a diff. A
 * new prompt's diff shows its whole text as added. Why a save was refused shows under the text.
 */
export function PromptEditor({ draft, nextVersion, problem, nameRef, textRef, onChange }: PromptEditorProps) {
  const ids = { name: useId(), text: useId(), problem: useId() };
  const describedBy = problem === null ? undefined : ids.problem;
  const after = normaliseAgentPromptDraft(draft);
  const before = draft.id === null ? { name: after.name, text: '' } : draft.base;

  return (
    <>
      <div className={fields.field}>
        <label htmlFor={ids.name} className={fields.label}>
          Name
        </label>
        <input
          ref={nameRef}
          id={ids.name}
          type="text"
          value={draft.name}
          aria-invalid={problem !== null || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className={`${fields.field} ${styles.textField}`}>
        <label htmlFor={ids.text} className={fields.label}>
          Prompt
        </label>
        <textarea
          ref={textRef}
          id={ids.text}
          className={styles.textArea}
          value={draft.text}
          aria-describedby={describedBy}
          {...{ [AUTOFOCUS_ATTRIBUTE]: '' }}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      </div>
      {problem !== null && (
        <p id={ids.problem} role="alert" className={fields.error}>
          {problem}
        </p>
      )}
      {isDraftDirty(draft) && (
        <section aria-label="Unsaved changes" className={styles.changes}>
          <h3 className={styles.sectionHeading}>
            {draft.id === null ? 'New prompt' : 'Unsaved changes'} · Save adds version {nextVersion}
          </h3>
          <PromptDiff before={before} after={after} label="Unsaved changes" sameText="No text yet." />
        </section>
      )}
    </>
  );
}
