import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentPromptMessage, DEFAULT_AGENT_PROMPT, latestVersion, type AgentPromptLibrary } from '../../domain';
import { FakeClock } from '../platform/testing/fakes';
import { FileSettingsStore, SETTINGS_FILE_NAME } from '../settings/settings-store';
import { createTemporaryFolder, removeTemporaryFolder } from '../test-support/temporary-folder';
import {
  AGENT_PROMPTS_FILE_NAME,
  AgentPromptStoreMessage,
  FileAgentPromptStore,
  unreadablePromptsFileName,
} from './agent-prompt-store';

const NOW = '2026-11-23T09:30:00';

function texts(library: AgentPromptLibrary, id: string): string[] {
  return library.prompts.find((prompt) => prompt.id === id)?.versions.map((version) => version.text) ?? [];
}

describe('FileAgentPromptStore', () => {
  let userData: string;
  let clock: FakeClock;
  let ids: number;

  function store(legacyPrompt = async () => 'Prompt from settings'): FileAgentPromptStore {
    return new FileAgentPromptStore({
      userDataPath: userData,
      clock,
      legacyPrompt,
      newId: () => `prompt-${(ids += 1)}`,
    });
  }

  async function savedFile(): Promise<unknown> {
    return JSON.parse(await readFile(path.join(userData, AGENT_PROMPTS_FILE_NAME), 'utf8'));
  }

  beforeEach(async () => {
    userData = await createTemporaryFolder('mboard-agent-prompts-');
    clock = new FakeClock(NOW);
    ids = 0;
  });

  afterEach(async () => {
    await removeTemporaryFolder(userData);
  });

  it('starts the library with the customised prompt settings.json kept, before a settings save drops it', async () => {
    const settingsPath = path.join(userData, SETTINGS_FILE_NAME);
    await writeFile(
      settingsPath,
      JSON.stringify({ agent: { terminal: 'Terminal', command: 'codex', prompt: 'My own prompt', columns: ['Done'] } }),
    );
    const settings = new FileSettingsStore(userData);
    const prompts = store(() => settings.legacyAgentPrompt());

    const library = await prompts.load();
    await settings.update({ openAtLogin: false });

    expect(library).toEqual({
      prompts: [
        {
          id: 'prompt-1',
          versions: [{ number: 1, name: 'Default prompt', text: 'My own prompt', savedAt: NOW }],
        },
      ],
      selectedId: 'prompt-1',
    });
    expect(await savedFile()).toEqual(library);
    expect(JSON.parse(await readFile(settingsPath, 'utf8')).agent).toEqual({
      terminal: 'Terminal',
      command: 'codex',
      columns: ['Done'],
    });
    await expect(store(async () => 'Something else').load()).resolves.toEqual(library);
  });

  it('starts with the default prompt when settings.json has none', async () => {
    const settings = new FileSettingsStore(userData);
    const library = await store(() => settings.legacyAgentPrompt()).load();
    expect(library.prompts.map((prompt) => latestVersion(prompt).text)).toEqual([DEFAULT_AGENT_PROMPT]);
  });

  it('saves new prompts and every new version, stamped by the clock, and reads them back', async () => {
    const prompts = store();
    await prompts.load();
    clock.set('2026-11-24T10:00:00');
    await prompts.create({ name: 'Standup', text: 'Summarise yesterday.' });
    clock.set('2026-11-25T11:00:00');
    const saved = await prompts.save('prompt-2', { name: 'Standup', text: 'Summarise yesterday and today.' });

    expect(saved.selectedId).toBe('prompt-2');
    expect(texts(saved, 'prompt-2')).toEqual(['Summarise yesterday.', 'Summarise yesterday and today.']);
    expect(
      saved.prompts.find((prompt) => prompt.id === 'prompt-2')?.versions.map((version) => version.savedAt),
    ).toEqual(['2026-11-24T10:00:00', '2026-11-25T11:00:00']);
    await expect(store().load()).resolves.toEqual(saved);
    await expect(prompts.promptText('prompt-2')).resolves.toBe('Summarise yesterday and today.');
  });

  it('selects and deletes prompts, keeping at least one', async () => {
    const prompts = store();
    await prompts.load();
    await prompts.create({ name: 'Standup', text: '' });

    expect((await prompts.select('prompt-1')).selectedId).toBe('prompt-1');
    const afterDelete = await prompts.remove('prompt-1');
    expect(afterDelete.prompts.map((prompt) => prompt.id)).toEqual(['prompt-2']);
    expect(afterDelete.selectedId).toBe('prompt-2');
    await expect(prompts.remove('prompt-2')).rejects.toThrow(AgentPromptMessage.lastPrompt);
    expect(await savedFile()).toEqual(afterDelete);
  });

  it('refuses drafts and prompts it cannot save, without writing', async () => {
    const prompts = store();
    const started = await prompts.load();

    await expect(prompts.create({ name: 'Default PROMPT', text: '' })).rejects.toThrow(/already a prompt called/);
    await expect(prompts.save('gone', { name: 'X', text: '' })).rejects.toThrow(AgentPromptMessage.missing);
    await expect(prompts.promptText('gone')).rejects.toThrow(AgentPromptMessage.missing);
    expect(await savedFile()).toEqual(started);
  });

  it('runs changes one at a time, so none is lost', async () => {
    const prompts = store();
    await prompts.load();
    const created = await Promise.all(
      ['A', 'B', 'C', 'D'].map((name) => prompts.create({ name, text: `${name} text` })),
    );
    expect(created.at(-1)?.prompts).toHaveLength(5);
    expect(((await savedFile()) as AgentPromptLibrary).prompts).toHaveLength(5);
  });

  it('moves a file it cannot make sense of aside, and starts a new library', async () => {
    await writeFile(path.join(userData, AGENT_PROMPTS_FILE_NAME), '{ "prompts": [ broken');

    const library = await store().load();

    expect(library.prompts.map((prompt) => latestVersion(prompt).text)).toEqual(['Prompt from settings']);
    const asideName = unreadablePromptsFileName(clock.now());
    expect(await readdir(userData)).toContain(asideName);
    expect(await readFile(path.join(userData, asideName), 'utf8')).toBe('{ "prompts": [ broken');
  });

  it('says so in plain words when the prompts file cannot be written', async () => {
    const prompts = new FileAgentPromptStore({
      userDataPath: path.join(userData, SETTINGS_FILE_NAME, 'not-a-folder'),
      clock,
      legacyPrompt: async () => '',
    });
    await writeFile(path.join(userData, SETTINGS_FILE_NAME), '{}');

    await expect(prompts.load()).rejects.toThrow(AgentPromptStoreMessage.notSaved);
  });
});
