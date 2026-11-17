import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

type User = Awaited<ReturnType<typeof renderBoard>>['user'];

async function openTask(user: User, title: string): Promise<HTMLElement> {
  await user.click(screen.getByRole('article', { name: title }));
  return screen.getByRole('complementary', { name: 'Task details' });
}

function input(drawer: HTMLElement, label: string): HTMLInputElement {
  return within(drawer).getByLabelText(label) as HTMLInputElement;
}

const SAMPLE = () =>
  buildTask({
    title: 'Fix login',
    project: 'Acme',
    responsibility: 'Me',
    due: '2026-11-20',
    description: 'Staging fails',
    comments: [
      { at: '2026-11-11 09:00', text: 'First comment' },
      { at: '2026-11-12 10:30', text: 'Second comment' },
    ],
    history: [
      { at: '2026-11-10 09:00', text: 'Created in To do' },
      { at: '2026-11-12 10:30', text: 'Comment added' },
    ],
  });

describe('Task detail drawer fields', () => {
  it('shows every field, with created and updated times', async () => {
    const { user } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    expect(input(drawer, 'Title').value).toBe('Fix login');
    expect((within(drawer).getByLabelText('Column') as HTMLSelectElement).value).toBe('To do');
    expect((within(drawer).getByRole('radio', { name: 'Me' }) as HTMLInputElement).checked).toBe(true);
    expect(input(drawer, 'Project').value).toBe('Acme');
    expect(input(drawer, 'Due date').value).toBe('2026-11-20');
    expect(input(drawer, 'Description').value).toBe('Staging fails');
    expect(within(drawer).getByText('10 Nov 2026, 09:00')).toBeTruthy();
    expect(within(drawer).getByText('16 Nov 2026, 10:00')).toBeTruthy();
  });

  it('saves the title on blur and follows the renamed task', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.clear(input(drawer, 'Title'));
    await user.type(input(drawer, 'Title'), 'Fix sign in');
    await user.tab();
    expect(fake.api.editTask).toHaveBeenCalledWith('tasks/Fix login.md', { field: 'title', value: 'Fix sign in' });
    await waitFor(() => expect(input(drawer, 'Title').value).toBe('Fix sign in'));
    expect(screen.getByRole('complementary', { name: 'Task details' })).toBeTruthy();
    expect(screen.queryByText(/no longer on the board/)).toBeNull();
    expect(screen.getByRole('article', { name: 'Fix sign in' })).toBeTruthy();
  });

  it('saves the title on Enter and ignores an empty title', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.clear(input(drawer, 'Title'));
    await user.keyboard('{Enter}');
    expect(fake.api.editTask).not.toHaveBeenCalled();
    await waitFor(() => expect(input(drawer, 'Title').value).toBe('Fix login'));
    await user.type(input(drawer, 'Title'), ' now{Enter}');
    expect(fake.api.editTask).toHaveBeenCalledWith('tasks/Fix login.md', { field: 'title', value: 'Fix login now' });
  });

  it('saves nothing when a value is unchanged, and abandons an edit on Esc', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.click(input(drawer, 'Project'));
    await user.tab();
    expect(fake.api.editTask).not.toHaveBeenCalled();
    await user.click(input(drawer, 'Project'));
    await user.type(input(drawer, 'Project'), ' extra{Escape}');
    expect(fake.api.editTask).not.toHaveBeenCalled();
    expect(input(drawer, 'Project').value).toBe('Acme');
  });

  it('saves the project, and clears it when emptied', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.clear(input(drawer, 'Project'));
    await user.type(input(drawer, 'Project'), 'Other{Enter}');
    expect(fake.api.editTask).toHaveBeenLastCalledWith('tasks/Fix login.md', { field: 'project', value: 'Other' });
    await user.clear(input(drawer, 'Project'));
    await user.tab();
    expect(fake.api.editTask).toHaveBeenLastCalledWith('tasks/Fix login.md', { field: 'project', value: null });
  });

  it('saves a due date, and removes it with the clear button', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.clear(input(drawer, 'Due date'));
    await user.type(input(drawer, 'Due date'), '2026-12-01');
    await user.tab();
    expect(fake.api.editTask).toHaveBeenLastCalledWith('tasks/Fix login.md', { field: 'due', value: '2026-12-01' });
    await user.click(within(drawer).getByRole('button', { name: 'Remove due date' }));
    expect(fake.api.editTask).toHaveBeenLastCalledWith('tasks/Fix login.md', { field: 'due', value: null });
    await waitFor(() => expect(input(drawer, 'Due date').value).toBe(''));
    expect(within(drawer).queryByRole('button', { name: 'Remove due date' })).toBeNull();
  });

  it('saves the description with Cmd+Enter, and a plain Enter adds a line', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.type(input(drawer, 'Description'), '{Enter}More');
    expect(fake.api.editTask).not.toHaveBeenCalled();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(fake.api.editTask).toHaveBeenCalledWith('tasks/Fix login.md', {
      field: 'description',
      value: 'Staging fails\nMore',
    });
  });

  it('saves the responsibility as soon as it is chosen', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.click(within(drawer).getByRole('radio', { name: 'Internal' }));
    expect(fake.api.editTask).toHaveBeenCalledWith('tasks/Fix login.md', { field: 'responsibility', value: 'Internal' });
  });

  it('moves the task to the top of another column with the Column field', async () => {
    const { user, fake } = await renderBoard({
      tasks: [SAMPLE(), buildTask({ title: 'Busy', status: 'In progress', order: 1 })],
    });
    const drawer = await openTask(user, 'Fix login');
    await user.selectOptions(within(drawer).getByLabelText('Column'), 'In progress');
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Fix login.md', 'In progress', 'tasks/Busy.md');
    const inProgress = screen.getByRole('region', { name: 'In progress' });
    expect(within(inProgress).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Fix login', 'Busy']);
  });

  it('refreshes from outside changes except for the field being edited', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.click(input(drawer, 'Project'));
    await user.type(input(drawer, 'Project'), 'X');
    act(() => {
      fake.setTasks(
        fake.tasks().map((task) => ({ ...task, project: 'Changed outside', description: 'Edited in Obsidian' })),
      );
    });
    expect(input(drawer, 'Project').value).toBe('AcmeX');
    expect(input(drawer, 'Description').value).toBe('Edited in Obsidian');
  });

  it('closes with a notice when the task disappears', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE(), buildTask({ title: 'Other' })] });
    await openTask(user, 'Fix login');
    act(() => fake.setTasks(fake.tasks().filter((task) => task.title !== 'Fix login')));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Task details' })).toBeNull());
    expect(screen.getByText(/no longer on the board/)).toBeTruthy();
  });

  it('opens the task a notification points at', async () => {
    const { fake } = await renderBoard({ tasks: [SAMPLE()] });
    act(() => fake.pushOpenTask('tasks/Fix login.md'));
    const drawer = await screen.findByRole('complementary', { name: 'Task details' });
    expect(input(drawer, 'Title').value).toBe('Fix login');
  });
});

describe('Task detail drawer Save', () => {
  function drawerOrNull(): HTMLElement | null {
    return screen.queryByRole('complementary', { name: 'Task details' });
  }

  it('closes straight away when no field is being edited', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    expect(within(drawer).queryByRole('button', { name: 'Close' })).toBeNull();
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(drawerOrNull()).toBeNull());
    expect(fake.api.editTask).not.toHaveBeenCalled();
  });

  it('commits the field being edited and waits for that save before closing', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const saveTask = fake.api.editTask.getMockImplementation();
    if (saveTask === undefined) throw new Error('The fake has no editTask.');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake.api.editTask.mockImplementationOnce(async (...args) => {
      await gate;
      return saveTask(...args);
    });
    const drawer = await openTask(user, 'Fix login');
    await user.type(input(drawer, 'Description'), ' on Fridays');
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(fake.api.editTask).toHaveBeenCalledWith('tasks/Fix login.md', {
      field: 'description',
      value: 'Staging fails on Fridays',
    });
    expect(fake.api.editTask).toHaveBeenCalledTimes(1);
    expect(drawerOrNull()).not.toBeNull();
    await act(async () => release());
    await waitFor(() => expect(drawerOrNull()).toBeNull());
    expect(fake.tasks()[0]?.description).toBe('Staging fails on Fridays');
  });

  it('stays open and shows the error when that save fails', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    fake.api.editTask.mockRejectedValueOnce(new Error('The file is locked.'));
    const drawer = await openTask(user, 'Fix login');
    await user.type(input(drawer, 'Project'), ' Corp');
    await user.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('The file is locked.')).toBeTruthy();
    expect(drawerOrNull()).not.toBeNull();
  });
});

describe('Task detail drawer comments and history', () => {
  it('lists comments oldest first with their timestamps', async () => {
    const { user } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    const comments = within(within(drawer).getByRole('region', { name: 'Comments' })).getAllByRole('listitem');
    expect(comments.map((item) => item.textContent)).toEqual([
      '11 Nov 2026, 09:00First comment',
      '12 Nov 2026, 10:30Second comment',
    ]);
  });

  it('adds a comment with the button and with Cmd+Enter, ignoring blanks', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    const add = within(drawer).getByRole('button', { name: 'Add comment' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    await user.type(within(drawer).getByRole('textbox', { name: 'New comment' }), 'Called the client');
    await user.click(add);
    expect(fake.api.addComment).toHaveBeenCalledWith('tasks/Fix login.md', 'Called the client');
    await waitFor(() => expect((within(drawer).getByRole('textbox', { name: 'New comment' }) as HTMLTextAreaElement).value).toBe(''));
    expect(within(drawer).getByText('Called the client')).toBeTruthy();

    await user.type(within(drawer).getByRole('textbox', { name: 'New comment' }), 'And again{Meta>}{Enter}{/Meta}');
    expect(fake.api.addComment).toHaveBeenLastCalledWith('tasks/Fix login.md', 'And again');
  });

  it('keeps the comment text when posting fails', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    fake.api.addComment.mockRejectedValueOnce(new Error('Comments are locked.'));
    const drawer = await openTask(user, 'Fix login');
    await user.type(within(drawer).getByRole('textbox', { name: 'New comment' }), 'Keep me');
    await user.click(within(drawer).getByRole('button', { name: 'Add comment' }));
    expect(await screen.findByText('Comments are locked.')).toBeTruthy();
    expect((within(drawer).getByRole('textbox', { name: 'New comment' }) as HTMLTextAreaElement).value).toBe('Keep me');
  });

  it('shows history newest first behind a disclosure button', async () => {
    const { user } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    const toggle = within(drawer).getByRole('button', { name: 'History' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(drawer).queryByText('Created in To do')).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const entries = within(within(drawer).getByRole('list', { name: 'History entries' })).getAllByRole('listitem');
    expect(entries.map((entry) => entry.textContent)).toEqual([
      '12 Nov 2026, 10:30 Comment added',
      '10 Nov 2026, 09:00 Created in To do',
    ]);
  });
});

describe('Task detail drawer actions', () => {
  it('shows Mark complete outside Done and Archive in Done', async () => {
    const { user } = await renderBoard({
      tasks: [SAMPLE(), buildTask({ title: 'Finished', status: 'Done' })],
    });
    let drawer = await openTask(user, 'Fix login');
    expect(within(drawer).getByRole('button', { name: 'Mark complete' })).toBeTruthy();
    expect(within(drawer).queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Restore' })).toBeNull();
    drawer = await openTask(user, 'Finished');
    expect(within(drawer).queryByRole('button', { name: 'Mark complete' })).toBeNull();
    expect(within(drawer).getByRole('button', { name: 'Archive' })).toBeTruthy();
  });

  it('archives from the drawer and follows the task into the archive', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Finished', status: 'Done' })] });
    const drawer = await openTask(user, 'Finished');
    await user.click(within(drawer).getByRole('button', { name: 'Archive' }));
    expect(fake.api.archiveTask).toHaveBeenCalledWith('tasks/Finished.md');
    await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Restore' })).toBeTruthy());
    expect(screen.queryByText(/no longer on the board/)).toBeNull();
    expect(input(drawer, 'Title').readOnly).toBe(true);
  });

  it('asks before deleting, and deletes only when confirmed', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE(), buildTask({ title: 'Other' })] });
    const drawer = await openTask(user, 'Fix login');
    await user.click(within(drawer).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog');
    expect(fake.api.deleteTask).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fake.api.deleteTask).not.toHaveBeenCalled();

    await user.click(within(drawer).getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(fake.api.deleteTask).toHaveBeenCalledWith('tasks/Fix login.md');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Task details' })).toBeNull());
    expect(screen.queryByText(/no longer on the board/)).toBeNull();
    expect(screen.queryByRole('article', { name: 'Fix login' })).toBeNull();
  });

  it('cancels the delete confirmation with Esc', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.click(within(drawer).getByRole('button', { name: 'Delete' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fake.api.deleteTask).not.toHaveBeenCalled();
  });

  it('opens the task in Obsidian', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.click(within(drawer).getByRole('button', { name: 'Open in Obsidian' }));
    expect(fake.api.openInObsidian).toHaveBeenCalledWith('tasks/Fix login.md');
  });

  it('shows a rejected command as a toast, with the message as it is', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    fake.api.editTask.mockRejectedValueOnce(new Error('A file with that name already exists.'));
    const drawer = await openTask(user, 'Fix login');
    await user.type(input(drawer, 'Title'), ' again{Enter}');
    const toast = await screen.findByText('A file with that name already exists.');
    expect(toast.closest('[role="alert"]')).toBeTruthy();
    await waitFor(() => expect(input(drawer, 'Title').value).toBe('Fix login'));
  });
});

describe('Task detail drawer for an archived task', () => {
  it('makes every field read-only and offers Restore', async () => {
    const archived = buildTask({ title: 'Old', status: 'Done', isArchived: true, project: 'Acme', due: '2026-11-01', description: 'Done long ago' });
    const { user, fake } = await renderBoard({ tasks: [archived] });
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    await user.click(screen.getByRole('button', { name: 'Old' }));
    const drawer = screen.getByRole('complementary', { name: 'Task details' });
    expect(input(drawer, 'Title').readOnly).toBe(true);
    expect(input(drawer, 'Project').readOnly).toBe(true);
    expect(input(drawer, 'Due date').readOnly).toBe(true);
    expect(input(drawer, 'Description').readOnly).toBe(true);
    expect((within(drawer).getByLabelText('Column') as HTMLSelectElement).disabled).toBe(true);
    expect((within(drawer).getByRole('radio', { name: 'Internal' }) as HTMLInputElement).disabled).toBe(true);
    expect(within(drawer).queryByRole('textbox', { name: 'New comment' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Remove due date' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Mark complete' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Archive' })).toBeNull();
    await user.click(within(drawer).getByRole('button', { name: 'Restore' }));
    expect(fake.api.restoreTask).toHaveBeenCalledWith('archive/Old.md');
  });
});
