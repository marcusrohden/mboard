import { expect, test } from './fixtures';

test('shows the setup screen when no board folder is configured', async ({ mainWindow }) => {
  await expect(
    mainWindow.getByRole('heading', { name: 'Choose your board folder' }),
  ).toBeVisible();
  await expect(
    mainWindow.getByRole('button', { name: 'Choose folder…' }),
  ).toBeVisible();
});

test('keeps user data in the directory given by MBOARD_USER_DATA', async ({
  electronApp,
  userDataDir,
}) => {
  const userDataPath = await electronApp.evaluate(({ app }) =>
    app.getPath('userData'),
  );
  expect(userDataPath).toBe(userDataDir);
});
