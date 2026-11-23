import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import {
  AgentPromptMessage,
  addAgentPrompt,
  addAgentPromptVersion,
  findAgentPrompt,
  formatLocalDateTime,
  latestVersion,
  removeAgentPrompt,
  sanitiseAgentPromptLibrary,
  selectAgentPrompt,
  startAgentPromptLibrary,
  type AgentPromptDraft,
  type AgentPromptId,
  type AgentPromptLibrary,
} from '../../domain';
import { AtomicFileWriter } from '../fs/atomic-file-writer';
import { isNotFound } from '../fs/fs-errors';
import { SerialQueue } from '../fs/serial-queue';
import type { AgentPromptStore, Clock } from '../ports';

export const AGENT_PROMPTS_FILE_NAME = 'agent-prompts.json';

export const AgentPromptStoreMessage = {
  notRead: "mboard couldn't read your saved prompts.",
  notSaved: "mboard couldn't save your prompts.",
} as const;

/** What the prompt store needs from the rest of main. */
export interface AgentPromptStoreOptions {
  userDataPath: string;
  clock: Clock;
  /** The prompt a new library starts with: the one `settings.json` kept before prompts had a file of their own. */
  legacyPrompt(): Promise<string>;
  /** Makes the id of a new prompt. A random UUID unless a test sets it. */
  newId?: () => AgentPromptId;
}

/** The name an unreadable prompts file is moved to, so a new library never overwrites it. */
export function unreadablePromptsFileName(now: Date): string {
  return `agent-prompts.unreadable-${formatLocalDateTime(now).replace(/:/g, '-')}.json`;
}

function parseLibrary(text: string): AgentPromptLibrary | null {
  try {
    return sanitiseAgentPromptLibrary(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Keeps the saved agent prompts in `agent-prompts.json` inside the user-data folder (ADR 0014). Reads always go
 * to disk, and changes are serialised read-modify-writes, written atomically. The first read, with no file yet,
 * starts the library with the prompt `settings.json` kept, so nothing typed into an earlier version is lost. A
 * file that can't be made sense of is moved aside, never overwritten, and a new library takes its place.
 */
export class FileAgentPromptStore implements AgentPromptStore {
  private readonly filePath: string;
  private readonly changes = new SerialQueue();
  private readonly writer = new AtomicFileWriter();
  private readonly newId: () => AgentPromptId;

  constructor(private readonly options: AgentPromptStoreOptions) {
    this.filePath = path.join(options.userDataPath, AGENT_PROMPTS_FILE_NAME);
    this.newId = options.newId ?? (() => randomUUID());
  }

  load(): Promise<AgentPromptLibrary> {
    return this.changes.run(() => this.readOrStart());
  }

  create(draft: AgentPromptDraft): Promise<AgentPromptLibrary> {
    return this.change((library) => addAgentPrompt(library, this.newId(), draft, this.options.clock.now()));
  }

  save(id: AgentPromptId, draft: AgentPromptDraft): Promise<AgentPromptLibrary> {
    return this.change((library) => addAgentPromptVersion(library, id, draft, this.options.clock.now()));
  }

  remove(id: AgentPromptId): Promise<AgentPromptLibrary> {
    return this.change((library) => removeAgentPrompt(library, id));
  }

  select(id: AgentPromptId): Promise<AgentPromptLibrary> {
    return this.change((library) => selectAgentPrompt(library, id));
  }

  async promptText(id: AgentPromptId): Promise<string> {
    const prompt = findAgentPrompt(await this.load(), id);
    if (prompt === null) throw new Error(AgentPromptMessage.missing);
    return latestVersion(prompt).text;
  }

  private change(apply: (library: AgentPromptLibrary) => AgentPromptLibrary): Promise<AgentPromptLibrary> {
    return this.changes.run(async () => {
      const next = apply(await this.readOrStart());
      await this.write(next);
      return next;
    });
  }

  private async readOrStart(): Promise<AgentPromptLibrary> {
    const text = await this.readText();
    if (text !== null) {
      const library = parseLibrary(text);
      if (library !== null) return library;
      await this.setAsideUnreadable();
    }
    const started = startAgentPromptLibrary(this.newId(), await this.options.legacyPrompt(), this.options.clock.now());
    await this.write(started);
    return started;
  }

  private async readText(): Promise<string | null> {
    try {
      return await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return null;
      console.error('mboard could not read its saved prompts:', error);
      throw new Error(AgentPromptStoreMessage.notRead);
    }
  }

  private async setAsideUnreadable(): Promise<void> {
    const asideName = unreadablePromptsFileName(this.options.clock.now());
    try {
      await rename(this.filePath, path.join(this.options.userDataPath, asideName));
      console.error(`mboard could not make sense of ${AGENT_PROMPTS_FILE_NAME}, so it moved it to ${asideName}.`);
    } catch (error) {
      console.error(`mboard could not move the unreadable ${AGENT_PROMPTS_FILE_NAME} aside:`, error);
      throw new Error(AgentPromptStoreMessage.notRead);
    }
  }

  private async write(library: AgentPromptLibrary): Promise<void> {
    try {
      await mkdir(this.options.userDataPath, { recursive: true });
      await this.writer.write(this.filePath, `${JSON.stringify(library, null, 2)}\n`);
    } catch (error) {
      console.error('mboard could not save its prompts:', error);
      throw new Error(AgentPromptStoreMessage.notSaved);
    }
  }
}
