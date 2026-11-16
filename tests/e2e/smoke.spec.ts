import { expect, test } from './fixtures';

test('shows the mboard heading and the main process ping reply', async ({
  mainWindow,
}) => {
  await expect(
    mainWindow.getByRole('heading', { level: 1, name: 'mboard' }),
  ).toBeVisible();
  await expect(
    mainWindow.getByRole('status', { name: 'Ping reply' }),
  ).toHaveText('pong');
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
