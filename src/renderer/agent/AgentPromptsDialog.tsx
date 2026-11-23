import { useEffect, useRef, useState } from 'react';
import {
  AgentPromptMessage,
  findAgentPrompt,
  latestVersion,
  normaliseAgentPromptDraft,
  type AgentPrompt,
  type AgentPromptId,
  type AgentPromptVersion,
} from '../../domain';
import type { LocalDate } from '../../shared/contract';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import { UnsavedChangesDialog } from '../ui/UnsavedChangesDialog';
import { PromptEditor } from './PromptEditor';
import { PromptHistory } from './PromptHistory';
import { PromptList } from './PromptList';
import { isDraftDirty, useAgentPrompts, type PromptDraft, type PromptsState } from './use-agent-prompts';
import { useOpenAgent } from './use-open-agent';
import styles from './AgentPromptsDialog.module.css';

interface AgentPromptsDialogProps {
  /** The agent's columns as a phrase, such as `In progress and Done`, or `null` while they load. */
  agentColumns: string | null;
  /** How many tasks the agent would get now. */
  taskCount: number;
  today: LocalDate;
  onClose: () => void;
}

/** Something the person asked for that unsaved changes have to be saved or dropped before. */
type Step =
  | { kind: 'select'; id: AgentPromptId }
  | { kind: 'new' }
  | { kind: 'restore'; version: AgentPromptVersion }
  | { kind: 'open' }
  | { kind: 'close' };

const STEP_PURPOSES: Readonly<Record<Step['kind'], string>> = {
  select: 'before showing another prompt',
  new: 'before starting a new prompt',
  restore: 'before restoring an earlier version',
  open: 'before opening the agent',
  close: 'before closing',
};

function draftName(draft: PromptDraft): string {
  return normaliseAgentPromptDraft(draft).name || draft.base.name;
}

function unsavedTitle(draft: PromptDraft): string {
  return draft.id === null ? `Save “${draftName(draft)}”?` : `Save changes to “${draftName(draft)}”?`;
}

function unsavedMessage(step: Step, shown: AgentPrompt | null): string {
  const purpose = STEP_PURPOSES[step.kind];
  if (shown === null) {
    const consequence =
      step.kind === 'open' ? ' The agent opens only with a saved prompt.' : " If you don't save it, it's lost.";
    return `Save the new prompt as version 1 ${purpose}?${consequence}`;
  }
  const saved = latestVersion(shown).number;
  const consequence = step.kind === 'open' ? `they're lost, and the agent opens with version ${saved}` : "they're lost";
  return `Save your changes as version ${saved + 1} ${purpose}? If you don't save them, ${consequence}.`;
}

function tasksSummary(taskCount: number, columns: string): string {
  if (taskCount === 0) return `There are no tasks in ${columns} to give the agent yet.`;
  const tasks = taskCount === 1 ? 'the 1 task' : `the ${taskCount} tasks`;
  return `The agent starts with the prompt, then ${tasks} in ${columns}.`;
}

function deleteBlocker(state: PromptsState): string | undefined {
  if (state.draft.id === null) return "This prompt isn't saved yet.";
  return state.library.prompts.length === 1 ? AgentPromptMessage.lastPrompt : undefined;
}

function versionCount(prompt: AgentPrompt): string {
  return prompt.versions.length === 1 ? 'its version' : `all ${prompt.versions.length} of its versions`;
}

/**
 * The Open agent dialog: the saved prompts in a sidebar, and the one shown in an editor. The selected prompt
 * shows first, which is the one last shown. Every save adds a version, and while the prompt differs from its
 * latest version, the editor shows the unsaved changes as a diff. **History** (⇧⌘H) lists every version with
 * its diff, and restoring one puts it back in the editor to save as a new version.
 *
 * Showing another prompt, starting a new one, restoring a version, opening the agent or closing first asks to
 * save unsaved changes. **Open agent** (⌘↵) starts the agent with the saved prompt and the tasks in the agent's
 * columns, and closes the dialog; it is off while those columns are empty. ⌘S saves, ⌘N starts a new prompt,
 * ⇧⌘⌫ deletes the prompt after asking, and ⌘. or Esc closes.
 */
export function AgentPromptsDialog({ agentColumns, taskCount, today, onClose }: AgentPromptsDialogProps) {
  const prompts = useAgentPrompts();
  const agent = useOpenAgent();
  const [view, setView] = useState<'prompt' | 'history'>('prompt');
  const [pending, setPending] = useState<Step | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [nameFocusRequest, setNameFocusRequest] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const { state } = prompts;
  const isLoaded = state !== null;
  const columns = agentColumns ?? "the agent's columns";

  useEffect(() => {
    if (isLoaded) textRef.current?.focus();
  }, [isLoaded]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null || editor.contains(document.activeElement)) return;
    const first = view === 'prompt' ? textRef.current : editor.querySelector<HTMLElement>('[aria-expanded]');
    first?.focus();
  }, [view]);

  useEffect(() => {
    if (nameFocusRequest === 0) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [nameFocusRequest]);

  function needsSaving(step: Step, current: PromptsState): boolean {
    return isDraftDirty(current.draft) || (step.kind === 'open' && current.draft.id === null);
  }

  function request(step: Step): void {
    if (state === null) {
      if (step.kind === 'close') onClose();
      return;
    }
    if (step.kind === 'select' && step.id === state.draft.id) return;
    if (needsSaving(step, state)) setPending(step);
    else perform(step, state);
  }

  function perform(step: Step, current: PromptsState): void {
    setPending(null);
    switch (step.kind) {
      case 'select':
        prompts.show(current, step.id);
        return;
      case 'new':
        prompts.startNew(current);
        setView('prompt');
        setNameFocusRequest((count) => count + 1);
        return;
      case 'restore':
        prompts.restore(current, step.version);
        setView('prompt');
        return;
      case 'open':
        if (current.draft.id !== null) void openAgentWith(current.draft.id);
        return;
      case 'close':
        onClose();
    }
  }

  async function openAgentWith(id: AgentPromptId): Promise<void> {
    if (await agent.open(id)) onClose();
  }

  async function saveThenPerform(step: Step): Promise<void> {
    const saved = await prompts.save();
    if (saved === null) {
      setPending(null);
      setView('prompt');
      return;
    }
    perform(step, saved);
  }

  async function save(): Promise<void> {
    if ((await prompts.save()) === null) setView('prompt');
  }

  async function remove(): Promise<void> {
    setIsConfirmingDelete(false);
    await prompts.remove();
  }

  const shownId = state?.draft.id ?? null;
  const shown = state === null || shownId === null ? null : findAgentPrompt(state.library, shownId);

  if (pending !== null && state !== null) {
    return (
      <UnsavedChangesDialog
        key="unsaved"
        title={unsavedTitle(state.draft)}
        message={unsavedMessage(pending, shown)}
        canDiscard={!(pending.kind === 'open' && state.draft.id === null)}
        onSave={() => void saveThenPerform(pending)}
        onDiscard={() => perform(pending, prompts.discard(state))}
        onCancel={() => setPending(null)}
      />
    );
  }

  if (isConfirmingDelete && shown !== null) {
    return (
      <ConfirmDialog
        key="delete"
        title={`Delete “${latestVersion(shown).name}”?`}
        message={`The prompt and ${versionCount(shown)} will be deleted. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() => void remove()}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    );
  }

  const canSave = state !== null && !prompts.isSaving && (isDraftDirty(state.draft) || state.draft.id === null);
  const canOpen = state !== null && taskCount > 0 && !agent.isOpening;
  const blocker = state === null ? undefined : deleteBlocker(state);

  return (
    <Modal key="prompts" label="Open agent" size="large" onClose={() => request({ kind: 'close' })}>
      <header className={styles.header}>
        <h2 className={styles.title}>Open agent</h2>
        <p className={styles.subtitle}>{tasksSummary(taskCount, columns)}</p>
      </header>
      {state === null ? (
        <p role="status" className={styles.loading}>
          {prompts.loadFailed ? "mboard couldn't load your saved prompts." : 'Loading…'}
        </p>
      ) : (
        <div className={styles.body}>
          <PromptList
            library={state.library}
            draft={state.draft}
            onSelect={(id) => request({ kind: 'select', id })}
            onNew={() => request({ kind: 'new' })}
          />
          <section ref={editorRef} aria-label="Prompt" className={styles.editor}>
            <div className={styles.editorBar}>
              <h3 className={styles.editorTitle}>{view === 'history' && shown !== null ? 'History' : 'Prompt'}</h3>
              <Button
                aria-pressed={view === 'history'}
                disabled={shown === null}
                title={shown === null ? 'Save the prompt to start its history.' : undefined}
                shortcut="togglePromptHistory"
                onClick={() => setView((current) => (current === 'history' ? 'prompt' : 'history'))}
              >
                History
              </Button>
            </div>
            {view === 'history' && shown !== null ? (
              <PromptHistory
                key={shown.id}
                prompt={shown}
                today={today}
                onRestore={(version) => request({ kind: 'restore', version })}
              />
            ) : (
              <PromptEditor
                draft={state.draft}
                nextVersion={shown === null ? 1 : latestVersion(shown).number + 1}
                problem={prompts.problem}
                nameRef={nameRef}
                textRef={textRef}
                onChange={prompts.edit}
              />
            )}
          </section>
        </div>
      )}
      <footer className={styles.footer}>
        <Button
          variant="quiet"
          disabled={state === null || blocker !== undefined}
          title={blocker}
          shortcut="deletePrompt"
          onClick={() => setIsConfirmingDelete(true)}
        >
          Delete
        </Button>
        <span className={styles.spacer} />
        <Button shortcut="cancel" onClick={() => request({ kind: 'close' })}>
          Close
        </Button>
        <Button disabled={!canSave} shortcut="savePrompt" onClick={() => void save()}>
          Save
        </Button>
        <Button
          variant="primary"
          disabled={!canOpen}
          title={
            taskCount === 0
              ? `No tasks in ${columns} yet`
              : `Open your agent in a terminal with this prompt and the tasks in ${columns}`
          }
          shortcut="confirm"
          onClick={() => request({ kind: 'open' })}
        >
          Open agent
        </Button>
      </footer>
    </Modal>
  );
}
