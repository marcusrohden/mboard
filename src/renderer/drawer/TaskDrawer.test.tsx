import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HistoryEntry, LedgerChange } from '../../shared/contract';
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

function drawerOrNull(): HTMLElement | null {
  return screen.queryByRole('complementary', { name: 'Task details' });
}

const SAMPLE = () =>
  buildTask({
    title: 'Fix login',
    project: 'Acme',
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
    expect(input(drawer, 'Project').value).toBe('Acme');
    expect(input(drawer, 'Due date').value).toBe('2026-11-20');
    expect(input(drawer, 'Description').value).toBe('Staging fails');
    expect(within(drawer).getByText('10 Nov 2026, 09:00')).toBeTruthy();
    expect(within(drawer).getByText('16 Nov 2026, 10:00')).toBeTruthy();
    expect(
      within(drawer).getByTitle('Created 10 Nov 09:00 · Updated 16 Nov 10:00 — 0 working days, On track').textContent,
    ).toContain('0d');
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

  it('saves nothing when a value is unchanged', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.click(input(drawer, 'Project'));
    await user.tab();
    expect(fake.api.editTask).not.toHaveBeenCalled();
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

  it('has no responsibility field', async () => {
    const { user } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    expect(within(drawer).queryByRole('radiogroup')).toBeNull();
    expect(within(drawer).queryByText('Responsibility')).toBeNull();
  });

  it("lists all five columns in the Column select, showing the task's own", async () => {
    const { user } = await renderBoard({ tasks: [buildTask({ title: 'Waiting', status: 'With client' })] });
    const drawer = await openTask(user, 'Waiting');
    const select = within(drawer).getByLabelText('Column') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      'To do',
      'In progress',
      'Internal',
      'With client',
      'Done',
    ]);
    expect(select.value).toBe('With client');
  });

  it('moves the task into With client and then Internal with the Column field', async () => {
    const { user, fake } = await renderBoard({
      tasks: [SAMPLE(), buildTask({ title: 'Quote', status: 'With client', order: 1 })],
    });
    const drawer = await openTask(user, 'Fix login');
    await user.selectOptions(within(drawer).getByLabelText('Column'), 'With client');
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Fix login.md', 'With client', 'tasks/Quote.md');
    const withClient = screen.getByRole('region', { name: 'With client' });
    await waitFor(() =>
      expect(
        within(withClient)
          .getAllByRole('article')
          .map((a) => a.getAttribute('aria-label')),
      ).toEqual(['Fix login', 'Quote']),
    );

    await user.selectOptions(within(drawer).getByLabelText('Column'), 'Internal');
    expect(fake.api.moveTask).toHaveBeenLastCalledWith('tasks/Fix login.md', 'Internal', null);
    const internal = screen.getByRole('region', { name: 'Internal' });
    await waitFor(() =>
      expect(
        within(internal)
          .getAllByRole('article')
          .map((a) => a.getAttribute('aria-label')),
      ).toEqual(['Fix login']),
    );
    expect(
      fake
        .tasks()
        .find((task) => task.title === 'Fix login')
        ?.history.at(-1)?.text,
    ).toBe('Moved from With client to Internal');
  });

  it('moves the task to the top of another column with the Column field', async () => {
    const { user, fake } = await renderBoard({
      tasks: [SAMPLE(), buildTask({ title: 'Busy', status: 'In progress', order: 1 })],
    });
    const drawer = await openTask(user, 'Fix login');
    await user.selectOptions(within(drawer).getByLabelText('Column'), 'In progress');
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Fix login.md', 'In progress', 'tasks/Busy.md');
    const inProgress = screen.getByRole('region', { name: 'In progress' });
    expect(
      within(inProgress)
        .getAllByRole('article')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Fix login', 'Busy']);
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

describe('Task detail drawer dismissal', () => {
  it('closes without saving the field being edited from its close button', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.type(input(drawer, 'Description'), ' on Fridays');
    await user.click(within(drawer).getByRole('button', { name: 'Close without saving' }));
    expect(drawerOrNull()).toBeNull();
    expect(fake.api.editTask).not.toHaveBeenCalled();
    expect(fake.tasks()[0]?.description).toBe('Staging fails');
  });

  it('closes on Esc without saving the field being edited', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.type(input(drawer, 'Project'), ' Corp{Escape}');
    expect(drawerOrNull()).toBeNull();
    expect(fake.api.editTask).not.toHaveBeenCalled();
    expect(fake.tasks()[0]?.project).toBe('Acme');
  });

  it('closes on Esc while focus is on the board', async () => {
    const { user } = await renderBoard({ tasks: [SAMPLE()] });
    await openTask(user, 'Fix login');
    expect(document.activeElement).toBe(screen.getByRole('article', { name: 'Fix login' }));
    await user.keyboard('{Escape}');
    expect(drawerOrNull()).toBeNull();
  });

  it('closes without saving on a press on an empty part of the board', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openTask(user, 'Fix login');
    await user.type(input(drawer, 'Description'), ' on Fridays');
    await user.click(screen.getByRole('region', { name: 'Done' }));
    expect(drawerOrNull()).toBeNull();
    expect(fake.api.editTask).not.toHaveBeenCalled();
    expect(fake.tasks()[0]?.description).toBe('Staging fails');
  });

  it('only closes on a press on another task, which a second press then opens', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE(), buildTask({ title: 'Other' })] });
    const drawer = await openTask(user, 'Fix login');
    await user.type(input(drawer, 'Title'), ' now');
    await user.click(screen.getByRole('article', { name: 'Other' }));
    expect(drawerOrNull()).toBeNull();
    expect(fake.api.editTask).not.toHaveBeenCalled();
    const reopened = await openTask(user, 'Other');
    expect(input(reopened, 'Title').value).toBe('Other');
  });

  it('only closes on a press on a header control', async () => {
    const { user } = await renderBoard({ tasks: [SAMPLE()] });
    await openTask(user, 'Fix login');
    await user.click(screen.getByRole('button', { name: 'New task' }));
    expect(drawerOrNull()).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull();
  });

  it('stays open for presses inside it, in its dialogs and on toasts', async () => {
    const { user, fake } = await renderBoard({ tasks: [SAMPLE()] });
    fake.api.editTask.mockRejectedValueOnce(new Error('The file is locked.'));
    const drawer = await openTask(user, 'Fix login');
    await user.click(within(drawer).getByText('Created'));
    await user.type(input(drawer, 'Project'), ' Corp{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Hide message' }));
    expect(screen.queryByText('The file is locked.')).toBeNull();

    await user.click(within(drawer).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(dialog);
    await user.click(dialog.parentElement ?? dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
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
    await waitFor(() =>
      expect((within(drawer).getByRole('textbox', { name: 'New comment' }) as HTMLTextAreaElement).value).toBe(''),
    );
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
      "10 Nov 2026, 09:00 Created in To doCan't revert this far back: a later change was made before mboard kept a ledger.",
    ]);
  });
});

function ledgerEntry(at: string, text: string, changes: LedgerChange[]): HistoryEntry {
  return { at, text, ledger: { v: 1, at: `${at.replace(' ', 'T')}:20`, changes } };
}

const LEDGER_TASK = () =>
  buildTask({
    title: 'Renamed task',
    due: '2026-12-01',
    comments: [{ at: '2026-11-15 09:00', text: 'Later note' }],
    history: [
      ledgerEntry('2026-11-10 09:00', 'Created in To do', [
        { field: 'title', from: null, to: 'Original' },
        { field: 'status', from: null, to: 'To do' },
      ]),
      ledgerEntry('2026-11-14 14:02', 'Title changed from "Original" to "Renamed task"', [
        { field: 'title', from: 'Original', to: 'Renamed task' },
      ]),
      ledgerEntry('2026-11-15 09:00', 'Comment added', [
        { field: 'comments', added: [{ at: '2026-11-15 09:00', text: 'Later note' }], removed: [] },
      ]),
      ledgerEntry('2026-11-16 09:30', 'Due date changed from (none) to 2026-12-01', [
        { field: 'due', from: null, to: '2026-12-01' },
      ]),
    ],
  });

async function openHistory(user: User, title: string): Promise<HTMLElement> {
  const drawer = await openTask(user, title);
  await user.click(within(drawer).getByRole('button', { name: 'History' }));
  return drawer;
}

function historyEntry(drawer: HTMLElement, text: string): HTMLElement {
  const entries = within(within(drawer).getByRole('list', { name: 'History entries' })).getAllByRole('listitem');
  const entry = entries.find((item) => item.textContent?.includes(text));
  if (entry === undefined) throw new Error(`No history entry with "${text}".`);
  return entry;
}

describe('Task detail drawer revert', () => {
  it('offers Revert to here on every entry but the latest', async () => {
    const { user } = await renderBoard({ tasks: [LEDGER_TASK()] });
    const drawer = await openHistory(user, 'Renamed task');
    expect(within(drawer).getAllByRole('button', { name: 'Revert to here' })).toHaveLength(3);
    expect(within(historyEntry(drawer, 'Due date changed')).queryByRole('button')).toBeNull();
  });

  it('asks before reverting, with focus on Cancel, and Cancel changes nothing', async () => {
    const { user, fake } = await renderBoard({ tasks: [LEDGER_TASK()] });
    const drawer = await openHistory(user, 'Renamed task');
    await user.click(within(historyEntry(drawer, 'Title changed')).getByRole('button', { name: 'Revert to here' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Revert task?' });
    expect(
      within(dialog).getByText(
        '“Renamed task” will go back to how it was at 14 Nov 14:02. The 2 changes made after that will be removed from the task and its history.',
      ),
    ).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).getByRole('button', { name: 'Revert' })).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fake.api.revertTask).not.toHaveBeenCalled();
    expect(fake.tasks()[0]?.title).toBe('Renamed task');
  });

  it('says 1 change for a single later entry', async () => {
    const { user } = await renderBoard({ tasks: [LEDGER_TASK()] });
    const drawer = await openHistory(user, 'Renamed task');
    await user.click(within(historyEntry(drawer, 'Comment added')).getByRole('button', { name: 'Revert to here' }));
    expect(
      within(screen.getByRole('alertdialog')).getByText(
        /The 1 change made after that will be removed from the task and its history\.$/,
      ),
    ).toBeTruthy();
  });

  it('reverts when confirmed and follows the task to its old title', async () => {
    const { user, fake } = await renderBoard({ tasks: [LEDGER_TASK()] });
    const drawer = await openHistory(user, 'Renamed task');
    await user.click(within(historyEntry(drawer, 'Created in To do')).getByRole('button', { name: 'Revert to here' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revert' }));

    expect(fake.api.revertTask).toHaveBeenCalledWith('tasks/Renamed task.md', 0, {
      historyLength: 4,
      at: '2026-11-10 09:00',
      text: 'Created in To do',
    });
    await waitFor(() => expect(input(drawer, 'Title').value).toBe('Original'));
    expect(screen.queryByText(/no longer on the board/)).toBeNull();
    expect(input(drawer, 'Due date').value).toBe('');
    expect(within(drawer).queryByText('Later note')).toBeNull();
    expect(within(drawer).getByText('Reverted to 10 Nov 09:00 — 3 changes discarded')).toBeTruthy();
  });

  it('shows a refused revert as a toast', async () => {
    const { user, fake } = await renderBoard({ tasks: [LEDGER_TASK()] });
    fake.api.revertTask.mockRejectedValueOnce(
      new Error('This task changed since you opened its history. Check it and try again.'),
    );
    const drawer = await openHistory(user, 'Renamed task');
    await user.click(within(historyEntry(drawer, 'Created in To do')).getByRole('button', { name: 'Revert to here' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revert' }));
    expect(
      await screen.findByText('This task changed since you opened its history. Check it and try again.'),
    ).toBeTruthy();
    expect(input(drawer, 'Title').value).toBe('Renamed task');
  });

  it('says briefly why older entries from before the ledger have no revert control', async () => {
    const { user } = await renderBoard({ tasks: [SAMPLE()] });
    const drawer = await openHistory(user, 'Fix login');
    expect(within(drawer).queryByRole('button', { name: 'Revert to here' })).toBeNull();
    expect(
      within(historyEntry(drawer, 'Created in To do')).getByText(
        "Can't revert this far back: a later change was made before mboard kept a ledger.",
      ),
    ).toBeTruthy();
  });

  it('asks for a restore before an archived task can be reverted', async () => {
    const archived = { ...LEDGER_TASK(), id: 'archive/Renamed task.md', isArchived: true, status: 'Done' as const };
    const { user } = await renderBoard({ tasks: [archived] });
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    await user.click(screen.getByRole('button', { name: 'Renamed task' }));
    const drawer = screen.getByRole('complementary', { name: 'Task details' });
    await user.click(within(drawer).getByRole('button', { name: 'History' }));
    expect(within(drawer).queryByRole('button', { name: 'Revert to here' })).toBeNull();
    expect(within(drawer).getByText('Restore the task to revert it to an earlier entry.')).toBeTruthy();
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
    await user.keyboard('{Escape}');
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
    expect(drawerOrNull()).not.toBeNull();
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
    const archived = buildTask({
      title: 'Old',
      status: 'Done',
      isArchived: true,
      project: 'Acme',
      due: '2026-11-01',
      description: 'Done long ago',
    });
    const { user, fake } = await renderBoard({ tasks: [archived] });
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    await user.click(screen.getByRole('button', { name: 'Old' }));
    const drawer = screen.getByRole('complementary', { name: 'Task details' });
    expect(input(drawer, 'Title').readOnly).toBe(true);
    expect(input(drawer, 'Project').readOnly).toBe(true);
    expect(input(drawer, 'Due date').readOnly).toBe(true);
    expect(input(drawer, 'Description').readOnly).toBe(true);
    expect((within(drawer).getByLabelText('Column') as HTMLSelectElement).disabled).toBe(true);
    expect(within(drawer).queryByRole('textbox', { name: 'New comment' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Remove due date' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Mark complete' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Archive' })).toBeNull();
    await user.click(within(drawer).getByRole('button', { name: 'Restore' }));
    expect(fake.api.restoreTask).toHaveBeenCalledWith('archive/Old.md');
  });
});
