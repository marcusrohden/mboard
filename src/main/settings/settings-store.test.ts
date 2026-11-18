import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_SETTINGS } from '../../domain';
import { createTemporaryFolder, listFilesRecursively, removeTemporaryFolder } from '../test-support/temporary-folder';
import { FileSettingsStore, SETTINGS_FILE_NAME, sanitiseSettings } from './settings-store';

const DEFAULT_THRESHOLDS = { nudgeFrom: 2, stallingFrom: 4, staleFrom: 6 };
const DEFAULT_AGENT = { ...DEFAULT_AGENT_SETTINGS };

describe('FileSettingsStore', () => {
  let userData: string;
  let settingsPath: string;

  beforeEach(async () => {
    userData = await createTemporaryFolder('mboard-settings-');
    settingsPath = path.join(userData, SETTINGS_FILE_NAME);
  });

  afterEach(async () => {
    await removeTemporaryFolder(userData);
  });

  it('reads the defaults when there is no settings file', async () => {
    expect(await new FileSettingsStore(userData).read()).toEqual({
      boardPath: null,
      openAtLogin: true,
      ageThresholds: DEFAULT_THRESHOLDS,
      agent: DEFAULT_AGENT,
    });
  });

  it.each([
    ['invalid JSON', '{ boardPath: '],
    ['an array', '[1, 2]'],
    ['a string', '"hello"'],
    ['null', 'null'],
  ])('reads the defaults when the file holds %s', async (_description, content) => {
    await writeFile(settingsPath, content);
    expect(await new FileSettingsStore(userData).read()).toEqual({
      boardPath: null,
      openAtLogin: true,
      ageThresholds: DEFAULT_THRESHOLDS,
      agent: DEFAULT_AGENT,
    });
  });

  it('keeps valid fields and defaults only the invalid ones', async () => {
    await writeFile(
      settingsPath,
      JSON.stringify({ boardPath: '/Users/me/Vault/Board', openAtLogin: 'yes', windowBounds: { x: 1 } }),
    );
    expect(await new FileSettingsStore(userData).read()).toEqual({
      boardPath: '/Users/me/Vault/Board',
      openAtLogin: true,
      ageThresholds: DEFAULT_THRESHOLDS,
      agent: DEFAULT_AGENT,
    });
  });

  it('keeps valid age thresholds and defaults a set that is out of order', () => {
    const custom = { nudgeFrom: 3, stallingFrom: 5, staleFrom: 10 };
    expect(sanitiseSettings({ ageThresholds: custom }).ageThresholds).toEqual(custom);
    expect(sanitiseSettings({ ageThresholds: { nudgeFrom: 5, stallingFrom: 3, staleFrom: 10 } }).ageThresholds).toEqual(
      DEFAULT_THRESHOLDS,
    );
  });

  it('keeps valid agent settings and defaults only the unusable fields', () => {
    const custom = { terminal: 'Terminal', command: 'claude-personal', prompt: 'List my work.', columns: ['Done'] };
    expect(sanitiseSettings({ agent: custom }).agent).toEqual(custom);
    expect(sanitiseSettings({ agent: { ...custom, terminal: 'Hyper', command: 'a\nb' } }).agent).toEqual({
      ...custom,
      terminal: DEFAULT_AGENT.terminal,
      command: DEFAULT_AGENT.command,
    });
  });

  it('rejects a relative board path', () => {
    expect(sanitiseSettings({ boardPath: 'Vault/Board', openAtLogin: false })).toEqual({
      boardPath: null,
      openAtLogin: false,
      ageThresholds: DEFAULT_THRESHOLDS,
      agent: DEFAULT_AGENT,
    });
  });

  it('merges an update into the stored settings and writes them atomically', async () => {
    const store = new FileSettingsStore(userData);
    await store.update({ boardPath: '/Users/me/Vault/Board' });
    const updated = await store.update({ windowBounds: { x: 10, y: 20, width: 900, height: 700 } });

    const expected = {
      boardPath: '/Users/me/Vault/Board',
      openAtLogin: true,
      ageThresholds: DEFAULT_THRESHOLDS,
      agent: DEFAULT_AGENT,
      windowBounds: { x: 10, y: 20, width: 900, height: 700 },
    };
    expect(updated).toEqual(expected);
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual(expected);
    expect(await new FileSettingsStore(userData).read()).toEqual(expected);
    expect(await listFilesRecursively(userData)).toEqual([SETTINGS_FILE_NAME]);
  });

  it('does not lose either of two concurrent updates', async () => {
    const store = new FileSettingsStore(userData);
    await Promise.all([store.update({ boardPath: '/Board' }), store.update({ openAtLogin: false })]);
    expect(await store.read()).toEqual({
      boardPath: '/Board',
      openAtLogin: false,
      ageThresholds: DEFAULT_THRESHOLDS,
      agent: DEFAULT_AGENT,
    });
  });

  it('creates the user-data folder when it is missing', async () => {
    const nested = path.join(userData, 'nested', 'user-data');
    const store = new FileSettingsStore(nested);
    await store.update({ openAtLogin: false });
    expect(await store.read()).toEqual({
      boardPath: null,
      openAtLogin: false,
      ageThresholds: DEFAULT_THRESHOLDS,
      agent: DEFAULT_AGENT,
    });
  });
});
