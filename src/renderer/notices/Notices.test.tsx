import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

function unreadableNotice(): HTMLElement {
  const notice = screen.getAllByRole('status').find((status) => /couldn't be read/.test(status.textContent ?? ''));
  if (notice === undefined) throw new Error('No unreadable notice is shown.');
  return notice;
}

describe('Unreadable files notice', () => {
  it('is absent when every file can be read', async () => {
    await renderBoard({ tasks: [buildTask({ title: 'Fine' })] });
    expect(screen.queryByText(/couldn't be read/)).toBeNull();
  });

  it('starts with the count, in the singular and the plural', async () => {
    const { fake } = await renderBoard({
      unreadable: [{ id: 'tasks/Broken.md', reason: 'The frontmatter is not valid YAML.' }],
    });
    expect(unreadableNotice().textContent).toMatch(/^1 file couldn't be read/);
    act(() =>
      fake.setUnreadable([
        { id: 'tasks/Broken.md', reason: 'The frontmatter is not valid YAML.' },
        { id: 'archive/Worse.md', reason: 'The frontmatter is not a mapping.' },
      ]),
    );
    expect(unreadableNotice().textContent).toMatch(/^2 files couldn't be read/);
  });

  it('expands to show each path and reason', async () => {
    const { user } = await renderBoard({
      unreadable: [
        { id: 'tasks/Broken.md', reason: 'The frontmatter is not valid YAML.' },
        { id: 'archive/Worse.md', reason: 'The frontmatter is not a mapping.' },
      ],
    });
    expect(screen.queryByText('tasks/Broken.md')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show details' });
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('tasks/Broken.md')).toBeTruthy();
    expect(screen.getByText('The frontmatter is not valid YAML.')).toBeTruthy();
    expect(screen.getByText('archive/Worse.md')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText('tasks/Broken.md')).toBeNull();
  });
});

describe('Reminder banner', () => {
  const BANNER = [
    { taskId: 'tasks/Pay invoice.md', title: 'Pay invoice', due: '2026-11-10', overdue: true },
    { taskId: 'tasks/Call client.md', title: 'Call client', due: '2026-11-16', overdue: false },
  ];
  const TASKS = () => [
    buildTask({ title: 'Pay invoice', due: '2026-11-10' }),
    buildTask({ title: 'Call client', due: '2026-11-16' }),
  ];

  it('is absent without reminders', async () => {
    await renderBoard({ tasks: TASKS() });
    expect(screen.queryByRole('region', { name: 'Reminders' })).toBeNull();
  });

  it('lists the tasks, and each one opens its detail', async () => {
    const { user } = await renderBoard({ tasks: TASKS(), banner: BANNER });
    const banner = await screen.findByRole('region', { name: 'Reminders' });
    expect(within(banner).getAllByRole('listitem')).toHaveLength(2);
    expect(within(banner).getByText('Overdue, 10 Nov')).toBeTruthy();
    expect(within(banner).getByText('Due today, 16 Nov')).toBeTruthy();
    await user.click(within(banner).getByRole('button', { name: 'Call client' }));
    const drawer = screen.getByRole('complementary', { name: 'Task details' });
    expect((within(drawer).getByLabelText('Title') as HTMLInputElement).value).toBe('Call client');
  });

  it('is dismissed with Dismiss, telling main', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS(), banner: BANNER });
    const banner = await screen.findByRole('region', { name: 'Reminders' });
    await user.click(within(banner).getByRole('button', { name: 'Dismiss' }));
    expect(fake.api.dismissReminderBanner).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region', { name: 'Reminders' })).toBeNull();
  });

  it('appears when main pushes reminders, and comes back after a new push', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    act(() => fake.pushBanner(BANNER));
    await user.click(
      within(await screen.findByRole('region', { name: 'Reminders' })).getByRole('button', { name: 'Dismiss' }),
    );
    expect(screen.queryByRole('region', { name: 'Reminders' })).toBeNull();
    act(() => fake.pushBanner([BANNER[0]!]));
    const again = await screen.findByRole('region', { name: 'Reminders' });
    expect(within(again).getAllByRole('listitem')).toHaveLength(1);
  });

  it('explains why reminders show here when notifications are unavailable', async () => {
    await renderBoard({
      tasks: TASKS(),
      banner: BANNER,
      preferences: { openAtLogin: true, notificationsAvailable: false },
    });
    expect(await screen.findByText(/Notifications are unavailable/)).toBeTruthy();
  });
});

describe('Toasts for rejected commands', () => {
  it('shows the error message as it is, and hides it on request', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'Finished', status: 'Done' })],
    });
    fake.api.archiveTask.mockRejectedValueOnce(new Error("Couldn't move the file. It may be open in another app."));
    await user.click(
      within(screen.getByRole('article', { name: 'Finished' })).getByRole('button', { name: 'Archive' }),
    );
    const toast = await screen.findByText("Couldn't move the file. It may be open in another app.");
    expect(toast.closest('[role="alert"]')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hide message' }));
    await waitFor(() => expect(screen.queryByText(/Couldn't move the file/)).toBeNull());
    expect(screen.getByRole('article', { name: 'Finished' })).toBeTruthy();
  });
});

describe('Modal dialogs', () => {
  it('hide the page behind them from assistive technology and return focus on close', async () => {
    const { user } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    const opener = screen.getByRole('button', { name: 'New task' });
    await user.click(opener);
    expect(screen.queryByRole('searchbox', { name: 'Search tasks' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toBeTruthy();
    expect(document.activeElement).toBe(opener);
  });
});
