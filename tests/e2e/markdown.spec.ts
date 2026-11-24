import type { ConsoleMessage } from '@playwright/test';
import { expect, test } from './fixtures';

const RELEASE_NOTES = [
  '# Release',
  '',
  'Ship **v2** with the team',
  'after the review.',
  '',
  '- [x] Build',
  '- [ ] Announce',
  '',
  '[Docs](https://example.com/docs)',
].join('\n');

test.use({
  board: {
    tasks: [
      { title: 'Release plan', status: 'To do', order: 1, description: RELEASE_NOTES },
      { title: 'Short note', status: 'To do', order: 2, description: 'Short' },
    ],
  },
});

function isPolicyViolation(message: ConsoleMessage): boolean {
  return /Content Security Policy|Refused to/i.test(message.text());
}

test('renders a description as markdown under the app’s content security policy', async ({ mainWindow }) => {
  const violations: string[] = [];
  mainWindow.on('console', (message) => {
    if (isPolicyViolation(message)) violations.push(message.text());
  });

  await mainWindow.getByRole('article', { name: 'Release plan' }).click();
  const drawer = mainWindow.getByRole('complementary', { name: 'Task details' });
  const description = drawer.getByRole('group', { name: 'Description' });

  await expect(description.getByRole('heading', { level: 1, name: 'Release' })).toBeVisible();
  await expect(description.locator('strong')).toHaveText('v2');
  await expect(description.getByRole('checkbox')).toHaveCount(2);
  await expect(description.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://example.com/docs');

  await description.getByText('after the review.').click();
  await expect(drawer.getByRole('textbox', { name: 'Description' })).toHaveValue(RELEASE_NOTES);
  expect(violations).toEqual([]);
});

test('opens a link through main and leaves the app where it was', async ({ electronApp, mainWindow }) => {
  await electronApp.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as { openedLinks?: string[] }).openedLinks = opened;
    shell.openExternal = async (url: string) => {
      opened.push(url);
    };
  });
  const pageBefore = mainWindow.url();

  await mainWindow.getByRole('article', { name: 'Release plan' }).click();
  const drawer = mainWindow.getByRole('complementary', { name: 'Task details' });
  await drawer.getByRole('group', { name: 'Description' }).getByRole('link', { name: 'Docs' }).click();

  await expect
    .poll(() => electronApp.evaluate(() => (globalThis as { openedLinks?: string[] }).openedLinks))
    .toEqual(['https://example.com/docs']);
  expect(mainWindow.url()).toBe(pageBefore);
  await expect(drawer.getByRole('textbox', { name: 'Description' })).toHaveCount(0);
});

test('a click below the description lands even though the description shrinks back to rendered', async ({
  mainWindow,
}) => {
  await mainWindow.getByRole('article', { name: 'Short note' }).click();
  const drawer = mainWindow.getByRole('complementary', { name: 'Task details' });
  await drawer.getByRole('group', { name: 'Description' }).click();
  const source = drawer.getByRole('textbox', { name: 'Description' });
  await expect(source).toBeFocused();
  const sourceHeight = (await source.boundingBox())?.height ?? 0;

  await drawer.getByRole('button', { name: 'Mark complete' }).click();

  const moveDialog = mainWindow.getByRole('dialog', { name: 'Move to Done' });
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByRole('button', { name: 'Cancel' }).click();
  const renderedHeight = (await drawer.getByRole('group', { name: 'Description' }).boundingBox())?.height ?? 0;
  expect(sourceHeight - renderedHeight).toBeGreaterThan(20);
});
