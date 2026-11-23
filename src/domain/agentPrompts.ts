import type { LocalDateTime } from './model';
import { formatLocalDateTime, normaliseTimestamp } from './time';

/** A saved prompt's id, made by main when the prompt is first saved. */
export type AgentPromptId = string;

/** One saved state of an agent prompt: its name and text, and when it was saved. Versions count from 1. */
export interface AgentPromptVersion {
  number: number;
  name: string;
  text: string;
  savedAt: LocalDateTime;
}

/**
 * A saved agent prompt with every version of it, oldest first. There is always at least one, and the latest is
 * the prompt as it is now. Versions are only ever added.
 */
export interface AgentPrompt {
  id: AgentPromptId;
  versions: AgentPromptVersion[];
}

/** The saved agent prompts in name order, at least one, and the one the Open agent dialog starts on. */
export interface AgentPromptLibrary {
  prompts: AgentPrompt[];
  selectedId: AgentPromptId;
}

/** A prompt's name and text as typed, before they are saved. */
export interface AgentPromptDraft {
  name: string;
  text: string;
}

export const AGENT_PROMPT_MAX_LENGTH = 20_000;
export const AGENT_PROMPT_NAME_MAX_LENGTH = 80;
export const DEFAULT_AGENT_PROMPT =
  'Generate my list of activities split by project so I can lodge them on my timesheet. Use the pattern "project - task name - task description".';
/** The name of the prompt a new library starts with, holding the prompt that Settings used to keep. */
export const FIRST_AGENT_PROMPT_NAME = 'Default prompt';
export const NEW_AGENT_PROMPT_NAME = 'New prompt';

const AGENT_PROMPT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const AgentPromptMessage = {
  missing: 'That prompt no longer exists. It may have been deleted.',
  lastPrompt: 'Keep at least one prompt, so the agent has one to start with.',
} as const;

/** Whether `value` can be a saved prompt's id. */
export function isAgentPromptId(value: unknown): value is AgentPromptId {
  return typeof value === 'string' && AGENT_PROMPT_ID.test(value);
}

/**
 * The prompt as it is now: its latest version.
 *
 * @throws Error when the prompt has no versions, which a sanitised library never holds.
 */
export function latestVersion(prompt: AgentPrompt): AgentPromptVersion {
  const latest = prompt.versions.at(-1);
  if (latest === undefined) throw new Error(`The prompt ${prompt.id} has no saved version.`);
  return latest;
}

/** The saved prompt with `id`, or `null` when there is none. */
export function findAgentPrompt(library: AgentPromptLibrary, id: AgentPromptId): AgentPrompt | null {
  return library.prompts.find((prompt) => prompt.id === id) ?? null;
}

/** The selected prompt, falling back to the first when the selection is unknown. */
export function selectedAgentPrompt(library: AgentPromptLibrary): AgentPrompt | null {
  return findAgentPrompt(library, library.selectedId) ?? library.prompts[0] ?? null;
}

/** The draft as it is saved: the name on one line with single spaces, and the text trimmed with `\n` line breaks. */
export function normaliseAgentPromptDraft(draft: AgentPromptDraft): AgentPromptDraft {
  return { name: draft.name.replace(/\s+/g, ' ').trim(), text: draft.text.replace(/\r\n?/g, '\n').trim() };
}

/** Whether saving `draft` over `version` would change nothing. */
export function isSameAsVersion(draft: AgentPromptDraft, version: AgentPromptDraft): boolean {
  const normalised = normaliseAgentPromptDraft(draft);
  return normalised.name === version.name && normalised.text === version.text;
}

function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;
}

function contentProblem({ name, text }: AgentPromptDraft): string | null {
  if (name === '') return 'Give the prompt a name.';
  if (name.length > AGENT_PROMPT_NAME_MAX_LENGTH) {
    return `A prompt's name can be at most ${AGENT_PROMPT_NAME_MAX_LENGTH} characters long.`;
  }
  if (text.length > AGENT_PROMPT_MAX_LENGTH) {
    return `The prompt can be at most ${AGENT_PROMPT_MAX_LENGTH.toLocaleString('en-GB')} characters long.`;
  }
  return null;
}

/**
 * The problem with saving `draft` in plain words, or `null` when it can be saved. `id` is the prompt being
 * saved, or `null` for a new one. Names are unique, ignoring case.
 */
export function agentPromptProblem(
  draft: AgentPromptDraft,
  library: AgentPromptLibrary,
  id: AgentPromptId | null,
): string | null {
  const normalised = normaliseAgentPromptDraft(draft);
  const problem = contentProblem(normalised);
  if (problem !== null) return problem;
  const clash = library.prompts.find(
    (prompt) => prompt.id !== id && sameName(latestVersion(prompt).name, normalised.name),
  );
  return clash === undefined ? null : `There's already a prompt called “${latestVersion(clash).name}”.`;
}

function byName(a: AgentPrompt, b: AgentPrompt): number {
  return latestVersion(a).name.localeCompare(latestVersion(b).name, undefined, { sensitivity: 'base' });
}

function inNameOrder(prompts: readonly AgentPrompt[]): AgentPrompt[] {
  return [...prompts].sort(byName);
}

function firstVersion(draft: AgentPromptDraft, now: Date): AgentPromptVersion {
  return { number: 1, ...normaliseAgentPromptDraft(draft), savedAt: formatLocalDateTime(now) };
}

function assertSaveable(draft: AgentPromptDraft, library: AgentPromptLibrary, id: AgentPromptId | null): void {
  const problem = agentPromptProblem(draft, library, id);
  if (problem !== null) throw new Error(problem);
}

function existing(library: AgentPromptLibrary, id: AgentPromptId): AgentPrompt {
  const prompt = findAgentPrompt(library, id);
  if (prompt === null) throw new Error(AgentPromptMessage.missing);
  return prompt;
}

/**
 * A new library holding one prompt, named `Default prompt`, with `text`: the prompt Settings kept before prompts
 * were saved on their own. Text that couldn't be saved as a prompt falls back to the default prompt.
 */
export function startAgentPromptLibrary(id: AgentPromptId, text: string, now: Date): AgentPromptLibrary {
  const draft = { name: FIRST_AGENT_PROMPT_NAME, text };
  const usable = contentProblem(normaliseAgentPromptDraft(draft)) === null;
  const prompt = { id, versions: [firstVersion(usable ? draft : { ...draft, text: DEFAULT_AGENT_PROMPT }, now)] };
  return { prompts: [prompt], selectedId: id };
}

/**
 * Adds a new prompt as its version 1, and selects it.
 *
 * @throws Error with a user-presentable message when the draft can't be saved.
 */
export function addAgentPrompt(
  library: AgentPromptLibrary,
  id: AgentPromptId,
  draft: AgentPromptDraft,
  now: Date,
): AgentPromptLibrary {
  assertSaveable(draft, library, null);
  const prompt = { id, versions: [firstVersion(draft, now)] };
  return { prompts: inNameOrder([...library.prompts, prompt]), selectedId: id };
}

/**
 * Saves `draft` as the prompt's next version, and selects the prompt. A draft that matches the latest version
 * adds nothing.
 *
 * @throws Error with a user-presentable message when the prompt is gone or the draft can't be saved.
 */
export function addAgentPromptVersion(
  library: AgentPromptLibrary,
  id: AgentPromptId,
  draft: AgentPromptDraft,
  now: Date,
): AgentPromptLibrary {
  const prompt = existing(library, id);
  assertSaveable(draft, library, id);
  const latest = latestVersion(prompt);
  if (isSameAsVersion(draft, latest)) return { ...library, selectedId: id };
  const version = { ...firstVersion(draft, now), number: latest.number + 1 };
  const saved = { ...prompt, versions: [...prompt.versions, version] };
  return {
    prompts: inNameOrder(library.prompts.map((candidate) => (candidate.id === id ? saved : candidate))),
    selectedId: id,
  };
}

/**
 * Deletes a prompt and all its versions. Deleting the selected prompt selects the one after it, or the one
 * before when it was last.
 *
 * @throws Error with a user-presentable message when the prompt is gone or is the only one left.
 */
export function removeAgentPrompt(library: AgentPromptLibrary, id: AgentPromptId): AgentPromptLibrary {
  existing(library, id);
  if (library.prompts.length === 1) throw new Error(AgentPromptMessage.lastPrompt);
  const index = library.prompts.findIndex((prompt) => prompt.id === id);
  const prompts = library.prompts.filter((prompt) => prompt.id !== id);
  const neighbour = prompts[Math.min(index, prompts.length - 1)];
  const keepsSelection = library.selectedId !== id && findAgentPrompt(library, library.selectedId) !== null;
  return { prompts, selectedId: keepsSelection ? library.selectedId : (neighbour?.id ?? '') };
}

/**
 * Makes `id` the prompt the Open agent dialog starts on.
 *
 * @throws Error with a user-presentable message when the prompt is gone.
 */
export function selectAgentPrompt(library: AgentPromptLibrary, id: AgentPromptId): AgentPromptLibrary {
  existing(library, id);
  return { ...library, selectedId: id };
}

/** `New prompt`, or `New prompt 2`, `New prompt 3` and so on when that name is taken. */
export function newAgentPromptName(library: AgentPromptLibrary): string {
  const names = library.prompts.map((prompt) => latestVersion(prompt).name);
  const isTaken = (name: string): boolean => names.some((candidate) => sameName(candidate, name));
  let name = NEW_AGENT_PROMPT_NAME;
  for (let suffix = 2; isTaken(name); suffix += 1) name = `${NEW_AGENT_PROMPT_NAME} ${suffix}`;
  return name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readVersion(raw: unknown): AgentPromptVersion | null {
  if (!isRecord(raw)) return null;
  const { number, name, text, savedAt } = raw;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) return null;
  if (typeof name !== 'string' || typeof text !== 'string' || typeof savedAt !== 'string') return null;
  const draft = normaliseAgentPromptDraft({ name, text });
  const at = normaliseTimestamp(savedAt);
  if (contentProblem(draft) !== null || at === null) return null;
  return { number, ...draft, savedAt: at };
}

function readVersions(raw: unknown): AgentPromptVersion[] {
  if (!Array.isArray(raw)) return [];
  const byNumber = new Map<number, AgentPromptVersion>();
  for (const version of raw.map(readVersion)) {
    if (version !== null && !byNumber.has(version.number)) byNumber.set(version.number, version);
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

function readPrompts(raw: unknown): AgentPrompt[] {
  if (!Array.isArray(raw)) return [];
  const prompts = new Map<AgentPromptId, AgentPrompt>();
  for (const candidate of raw) {
    if (!isRecord(candidate) || !isAgentPromptId(candidate['id']) || prompts.has(candidate['id'])) continue;
    const versions = readVersions(candidate['versions']);
    if (versions.length > 0) prompts.set(candidate['id'], { id: candidate['id'], versions });
  }
  return [...prompts.values()];
}

/**
 * Turns whatever the prompts file held into a usable library, or `null` when it holds no usable prompt. A
 * prompt keeps every version that can be read, and is dropped only when none can. An unknown selection falls
 * back to the first prompt.
 */
export function sanitiseAgentPromptLibrary(raw: unknown): AgentPromptLibrary | null {
  if (!isRecord(raw)) return null;
  const prompts = inNameOrder(readPrompts(raw['prompts']));
  const first = prompts[0];
  if (first === undefined) return null;
  const selectedId = prompts.some((prompt) => prompt.id === raw['selectedId'])
    ? (raw['selectedId'] as string)
    : first.id;
  return { prompts, selectedId };
}
