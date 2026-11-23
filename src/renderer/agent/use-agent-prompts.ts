import { useEffect, useState } from 'react';
import {
  agentPromptProblem,
  findAgentPrompt,
  isSameAsVersion,
  latestVersion,
  newAgentPromptName,
  selectAgentPrompt,
  selectedAgentPrompt,
  type AgentPrompt,
  type AgentPromptDraft,
  type AgentPromptId,
  type AgentPromptLibrary,
  type AgentPromptVersion,
} from '../../domain';
import { useRunCommand } from '../state/use-run-command';

/** The prompt being edited in the Open agent dialog. */
export interface PromptDraft extends AgentPromptDraft {
  /** The saved prompt being edited, or `null` for a new one. */
  id: AgentPromptId | null;
  /** What the draft started from: the latest version, or for a new prompt its suggested name and no text. */
  base: AgentPromptDraft;
}

/** The saved prompts and the draft shown, kept together so one never runs ahead of the other. */
export interface PromptsState {
  library: AgentPromptLibrary;
  draft: PromptDraft;
}

export interface AgentPrompts {
  /** `null` until the prompts have loaded. */
  state: PromptsState | null;
  loadFailed: boolean;
  problem: string | null;
  isSaving: boolean;
  edit: (patch: Partial<AgentPromptDraft>) => void;
  show: (from: PromptsState, id: AgentPromptId) => void;
  startNew: (from: PromptsState) => void;
  restore: (from: PromptsState, version: AgentPromptVersion) => void;
  /** Drops the draft's changes, or a new draft altogether, and resolves with the state that leaves. */
  discard: (from: PromptsState) => PromptsState;
  /** Saves the draft, and resolves with the state after saving, or `null` when it wasn't saved. */
  save: () => Promise<PromptsState | null>;
  remove: () => Promise<void>;
}

function draftOf(prompt: AgentPrompt): PromptDraft {
  const { name, text } = latestVersion(prompt);
  return { id: prompt.id, name, text, base: { name, text } };
}

function newDraft(library: AgentPromptLibrary): PromptDraft {
  const base = { name: newAgentPromptName(library), text: '' };
  return { id: null, ...base, base };
}

/** Whether the draft differs from what it started from, once trimmed. */
export function isDraftDirty(draft: PromptDraft): boolean {
  return !isSameAsVersion(draft, draft.base);
}

function stateFor(library: AgentPromptLibrary): PromptsState | null {
  const selected = selectedAgentPrompt(library);
  return selected === null ? null : { library, draft: draftOf(selected) };
}

/**
 * The Open agent dialog's saved prompts and the draft being edited. It loads the prompts once, shows the
 * selected one, and saves, deletes and selects through main, showing any failure in a toast. A save checks the
 * draft first and says what is wrong in `problem` without sending it. Selecting a prompt remembers it, so the
 * dialog opens on it next time.
 */
export function useAgentPrompts(): AgentPrompts {
  const run = useRunCommand();
  const [state, setState] = useState<PromptsState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void run((api) => api.getAgentPrompts()).then((result) => {
      if (!isMounted) return;
      const loaded = result.ok ? stateFor(result.value) : null;
      setState(loaded);
      setLoadFailed(loaded === null);
    });
    return () => {
      isMounted = false;
    };
  }, [run]);

  function replace(next: PromptsState): PromptsState {
    setState(next);
    setProblem(null);
    return next;
  }

  function edit(patch: Partial<AgentPromptDraft>): void {
    setState((current) => (current === null ? null : { ...current, draft: { ...current.draft, ...patch } }));
    setProblem(null);
  }

  function show(from: PromptsState, id: AgentPromptId): void {
    const prompt = findAgentPrompt(from.library, id);
    if (prompt === null) return;
    replace({ library: selectAgentPrompt(from.library, id), draft: draftOf(prompt) });
    void run((api) => api.selectAgentPrompt(id));
  }

  function discard(from: PromptsState): PromptsState {
    const { library, draft } = from;
    const prompt = draft.id === null ? selectedAgentPrompt(library) : findAgentPrompt(library, draft.id);
    return replace(prompt === null ? from : { library, draft: draftOf(prompt) });
  }

  async function save(): Promise<PromptsState | null> {
    if (state === null || isSaving) return null;
    const { library, draft } = state;
    const found = agentPromptProblem(draft, library, draft.id);
    setProblem(found);
    if (found !== null) return null;
    const submitted = { name: draft.name, text: draft.text };
    setIsSaving(true);
    const result = await run((api) =>
      draft.id === null ? api.createAgentPrompt(submitted) : api.saveAgentPrompt(draft.id, submitted),
    );
    setIsSaving(false);
    const saved = result.ok ? stateFor(result.value) : null;
    if (saved === null) return null;
    setState((current) => {
      const isUnchangedSince = current?.draft.name === submitted.name && current.draft.text === submitted.text;
      if (current === null || isUnchangedSince) return saved;
      return { library: saved.library, draft: { ...current.draft, id: saved.draft.id, base: saved.draft.base } };
    });
    return saved;
  }

  async function remove(): Promise<void> {
    const id = state?.draft.id ?? null;
    if (id === null) return;
    const result = await run((api) => api.deleteAgentPrompt(id));
    const next = result.ok ? stateFor(result.value) : null;
    if (next !== null) replace(next);
  }

  return {
    state,
    loadFailed,
    problem,
    isSaving,
    edit,
    show,
    startNew: (from) => replace({ ...from, draft: newDraft(from.library) }),
    restore: (from, version) => replace({ ...from, draft: { ...from.draft, name: version.name, text: version.text } }),
    discard,
    save,
    remove,
  };
}
