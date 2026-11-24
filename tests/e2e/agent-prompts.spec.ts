import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test as base } from './fixtures';

const PROMPT_FROM_SETTINGS = 'List what I finished, by project.\nOne line per task.';

/**
 * Starts the app as a copy from before saved prompts would find it: the prompt kept in `settings.json`, and no
 * `agent-prompts.json` yet.
 */
const test = base.extend({
  userDataDir: async ({ userDataDir }, use) => {
    const settingsPath = path.join(userDataDir, 'settings.json');
    const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
    const agent = { terminal: 'Terminal', command: 'claude', prompt: PROMPT_FROM_SETTINGS, columns: ['Done'] };
    await writeFile(settingsPath, JSON.stringify({ ...settings, agent }));
    await use(userDataDir);
  },
});

test.use({ board: { tasks: [{ title: 'Shipped', status: 'Done', order: 1 }] } });

async function savedPrompts(userDataDir: string): Promise<{ prompts: Array<{ versions: Array<{ text: string }> }> }> {
  return JSON.parse(await readFile(path.join(userDataDir, 'agent-prompts.json'), 'utf8'));
}

test('keeps the prompt Settings had as the first saved prompt, and saves every change as a version', async ({
  mainWindow,
  userDataDir,
}) => {
  await mainWindow.getByRole('button', { name: 'Open agent' }).click();
  const dialog = mainWindow.getByRole('dialog', { name: 'Open agent' });
  const rendered = dialog.getByRole('group', { name: 'Prompt' });
  await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Default prompt');
  await expect(rendered).toHaveText(PROMPT_FROM_SETTINGS);
  await rendered.click();
  const text = dialog.getByRole('textbox', { name: 'Prompt' });
  await expect(text).toHaveValue(PROMPT_FROM_SETTINGS);
  expect((await savedPrompts(userDataDir)).prompts[0]?.versions.map((version) => version.text)).toEqual([
    PROMPT_FROM_SETTINGS,
  ]);

  await text.fill('List what I finished, by project.\nOne line per task, with the hours.');
  const changes = dialog.getByRole('region', { name: 'Unsaved changes' });
  await expect(changes.getByText('@@ -1,2 +1,2 @@')).toBeVisible();
  await mainWindow.keyboard.press('Meta+S');
  await expect(changes).toBeHidden();

  await mainWindow.keyboard.press('Shift+Meta+H');
  await expect(dialog.getByRole('button', { name: /^Version 2\s*Current/ })).toBeVisible();
  expect((await savedPrompts(userDataDir)).prompts[0]?.versions).toHaveLength(2);

  await mainWindow.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
