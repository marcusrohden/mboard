import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { HistoryEntry, LedgerChange } from '../../shared/contract';
import { App } from '../App';
import { buildTask } from '../testing/builders';
import { useDomEnvironment } from '../testing/dom-environment';
import { createFakeMboard } from '../testing/fake-mboard';
import { answerMoveComment } from '../testing/move-comment';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

type User = Awaited<ReturnType<typeof renderBoard>>['user'];

const CONTROLS = 'button, select, input[type="checkbox"]';

/** Controls that act on one item of a list, or close themselves, and so have no shortcut of their own. */
function isExemptFromShortcuts(control: Element): boolean {
  return (
    control.getAttribute('aria-label') === 'Hide message' ||
    control.closest('table[aria-label="Archived tasks"]') !== null ||
    control.closest('[role="group"][aria-label$=" options"]') !== null
  );
}

function controlsWithoutShortcut(): string[] {
  return [...document.querySelectorAll(CONTROLS)]
    .filter((control) => !control.hasAttribute('aria-keyshortcuts') && !isExemptFromShortcuts(control))
    .map((control) => control.getAttribute('aria-label') ?? control.textContent ?? control.outerHTML);
}

function drawer(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Task details' });
}

function drawerOrNull(): HTMLElement | null {
  return screen.queryByRole('complementary', { name: 'Task details' });
}

function field(label: string): HTMLInputElement {
  return within(drawer()).getByLabelText(label) as HTMLInputElement;
}

function columnOf(title: string): string | undefined {
  return screen.getByRole('article', { name: title }).closest('section')?.getAttribute('aria-label') ?? undefined;
}

async function openTask(user: User, title: string): Promise<void> {
  await user.click(screen.getByRole('article', { name: title }));
}

function ledgerEntry(at: string, text: string, changes: LedgerChange[]): HistoryEntry {
  return { at, text, ledger: { v: 1, at: `${at.replace(' ', 'T')}:20`, changes } };
}

const BUSY_BOARD = () => ({
  tasks: [
    buildTask({
      title: 'Fix login',
      project: 'Acme',
      due: '2026-11-20',
      history: [
        ledgerEntry('2026-11-10 09:00', 'Created in To do', [
          { field: 'title', from: null, to: 'Fix login' },
          { field: 'status', from: null, to: 'To do' },
        ]),
        ledgerEntry('2026-11-16 09:30', 'Due date changed from (none) to 2026-11-20', [
          { field: 'due', from: null, to: '2026-11-20' },
        ]),
      ],
    }),
    buildTask({ title: 'Finished', status: 'Done' }),
    buildTask({ title: 'Old', status: 'Done', isArchived: true }),
  ],
  banner: [{ taskId: 'tasks/Fix login.md', title: 'Fix login', due: '2026-11-16', overdue: false }],
  unreadable: [{ id: 'tasks/Bad.md', reason: "The frontmatter isn't valid YAML." }],
  appUpdateStatus: {
    currentVersion: '0.1.0',
    stage: { kind: 'available' as const, version: '0.2.0', installBlocker: null },
  },
});

describe('Every control has a Command shortcut', () => {
  it('on the board, in the drawer, in every dialog and in the archived view', async () => {
    const { user } = await renderBoard(BUSY_BOARD());
    await user.click(screen.getByRole('button', { name: 'Show details' }));
    expect(controlsWithoutShortcut()).toEqual([]);
    await user.click(screen.getByRole('switch', { name: 'Stale only' }));
    expect(controlsWithoutShortcut()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await openTask(user, 'Fix login');
    await user.click(within(drawer()).getByRole('button', { name: 'History' }));
    expect(controlsWithoutShortcut()).toEqual([]);

    await user.click(within(drawer()).getByRole('button', { name: 'Revert to here' }));
    expect(controlsWithoutShortcut()).toEqual([]);
    await user.keyboard('{Escape}');
    await user.click(within(drawer()).getByRole('button', { name: 'Delete' }));
    expect(controlsWithoutShortcut()).toEqual([]);
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Archive all' }));
    expect(controlsWithoutShortcut()).toEqual([]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'New task' }));
    expect(controlsWithoutShortcut()).toEqual([]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(controlsWithoutShortcut()).toEqual([]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Archived' }));
    await user.click(screen.getByRole('button', { name: 'Old' }));
    expect(controlsWithoutShortcut()).toEqual([]);
  });

  it('on the setup screen, including its confirm step, and on the unavailable screen', async () => {
    const fake = createFakeMboard({ appState: { kind: 'needsSetup' } });
    fake.install();
    fake.api.chooseBoardFolder.mockResolvedValue({
      kind: 'needsConfirmation',
      path: '/elsewhere/Board',
      message: "This folder doesn't look like it's inside an Obsidian vault. Use it anyway?",
    });
    const { unmount } = render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }));
    await screen.findByRole('button', { name: 'Use anyway' });
    expect(controlsWithoutShortcut()).toEqual([]);
    unmount();

    createFakeMboard({ appState: { kind: 'unavailable', path: '/vault/Gone', reason: 'notFound' } }).install();
    render(<App />);
    await screen.findByRole('button', { name: 'Try again' });
    expect(controlsWithoutShortcut()).toEqual([]);
  });
});

describe('Task shortcuts in the drawer', () => {
  it('saves the field being edited with ⌘S and closes', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await openTask(user, 'Fix login');
    await user.type(field('Description'), ' on Fridays');
    await user.keyboard('{Meta>}s{/Meta}');
    await waitFor(() => expect(drawerOrNull()).toBeNull());
    expect(fake.api.editTask).toHaveBeenCalledWith('tasks/Fix login.md', {
      field: 'description',
      value: ' on Fridays',
    });
  });

  it('closes without saving with ⌘.', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await openTask(user, 'Fix login');
    await user.type(field('Description'), ' on Fridays');
    await user.keyboard('{Meta>}[Period]{/Meta}');
    expect(drawerOrNull()).toBeNull();
    expect(fake.api.editTask).not.toHaveBeenCalled();
  });

  it('moves the task with ⌘1 to ⌘5, and marks it complete with ⌘5', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await openTask(user, 'Fix login');
    expect(within(drawer()).getByRole('button', { name: 'Mark complete' }).getAttribute('aria-keyshortcuts')).toBe(
      'Meta+5',
    );
    await user.keyboard('{Meta>}3{/Meta}');
    await answerMoveComment(user, 'Internal');
    expect(fake.api.moveTask).toHaveBeenLastCalledWith('tasks/Fix login.md', 'Internal', null, null);
    await user.keyboard('{Meta>}5{/Meta}');
    await answerMoveComment(user, 'Done', 'Fixed');
    expect(fake.api.moveTask).toHaveBeenLastCalledWith('tasks/Fix login.md', 'Done', 'tasks/Finished.md', 'Fixed');
  });

  it('opens in Obsidian with ⌘O, and asks before deleting with ⇧⌘⌫, confirmed with ⌘↵', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await openTask(user, 'Fix login');
    await user.keyboard('{Meta>}o{/Meta}');
    expect(fake.api.openInObsidian).toHaveBeenCalledWith('tasks/Fix login.md');
    await user.keyboard('{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}');
    const dialog = screen.getByRole('alertdialog', { name: 'Delete task?' });
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(fake.api.deleteTask).toHaveBeenCalledWith('tasks/Fix login.md');
    expect(dialog.isConnected).toBe(false);
  });

  it('cancels a confirmation with ⌘. and leaves the drawer open', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await openTask(user, 'Fix login');
    await user.keyboard('{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}');
    await user.keyboard('{Meta>}[Period]{/Meta}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fake.api.deleteTask).not.toHaveBeenCalled();
    expect(drawerOrNull()).not.toBeNull();
  });

  it('shows the history with ⇧⌘H and reverts to the focused entry with ⇧⌘U', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await openTask(user, 'Fix login');
    await user.keyboard('{Meta>}{Shift>}h{/Shift}{/Meta}');
    const revert = within(drawer()).getByRole('button', { name: 'Revert to here' });
    await user.keyboard('{Meta>}{Shift>}u{/Shift}{/Meta}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    revert.focus();
    await user.keyboard('{Meta>}{Shift>}u{/Shift}{/Meta}');
    expect(screen.getByRole('alertdialog', { name: 'Revert task?' })).toBeTruthy();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(fake.api.revertTask).toHaveBeenCalled();
  });

  it('removes the due date with ⌘⌫ in its field', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await openTask(user, 'Fix login');
    field('Due date').focus();
    await user.keyboard('{Meta>}{Backspace}{/Meta}');
    expect(fake.api.editTask).toHaveBeenCalledWith('tasks/Fix login.md', { field: 'due', value: null });
  });

  it('archives and restores with ⇧⌘A and ⇧⌘R', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await openTask(user, 'Finished');
    await user.keyboard('{Meta>}{Shift>}r{/Shift}{/Meta}');
    expect(fake.api.restoreTask).not.toHaveBeenCalled();
    await user.keyboard('{Meta>}{Shift>}a{/Shift}{/Meta}');
    expect(fake.api.archiveTask).toHaveBeenCalledWith('tasks/Finished.md');
    await waitFor(() => expect(within(drawer()).getByRole('button', { name: 'Restore' })).toBeTruthy());
    await user.keyboard('{Meta>}{Shift>}r{/Shift}{/Meta}');
    expect(fake.api.restoreTask).toHaveBeenCalledWith('archive/Finished.md');
  });
});

describe('Task shortcuts on the focused card', () => {
  it('moves and archives the card that has focus while the drawer is closed', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    screen.getByRole('article', { name: 'Fix login' }).focus();
    await user.keyboard('{Meta>}2{/Meta}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.api.moveTask).toHaveBeenLastCalledWith('tasks/Fix login.md', 'In progress', null, null);
    await waitFor(() => expect(columnOf('Fix login')).toBe('In progress'));

    screen.getByRole('article', { name: 'Fix login' }).focus();
    await user.keyboard('{Meta>}{Shift>}a{/Shift}{/Meta}');
    expect(fake.api.archiveTask).not.toHaveBeenCalled();
    screen.getByRole('article', { name: 'Finished' }).focus();
    await user.keyboard('{Meta>}{Shift>}a{/Shift}{/Meta}');
    expect(fake.api.archiveTask).toHaveBeenCalledWith('tasks/Finished.md');
    expect(drawerOrNull()).toBeNull();
  });

  it('asks before deleting the focused card with ⇧⌘⌫, confirmed with ⌘↵', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    screen.getByRole('article', { name: 'Fix login' }).focus();
    await user.keyboard('{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}');
    const dialog = screen.getByRole('alertdialog', { name: 'Delete task?' });
    expect(drawerOrNull()).toBeNull();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(fake.api.deleteTask).toHaveBeenCalledWith('tasks/Fix login.md');
    expect(dialog.isConnected).toBe(false);
  });

  it('does nothing without a focused card or an open task', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await user.click(document.body);
    await user.keyboard('{Meta>}3{/Meta}');
    expect(fake.api.moveTask).not.toHaveBeenCalled();
    await user.keyboard('{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Board and notice shortcuts', () => {
  it('opens a reminder with ⌥⌘1, dismisses the banner with ⇧⌘B and shows the unreadable files with ⇧⌘I', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await user.keyboard('{Meta>}{Alt>}1{/Alt}{/Meta}');
    expect(field('Title').value).toBe('Fix login');
    await user.keyboard('{Escape}');
    await user.keyboard('{Meta>}{Shift>}i{/Shift}{/Meta}');
    expect(screen.getByText('tasks/Bad.md')).toBeTruthy();
    await user.keyboard('{Meta>}{Shift>}b{/Shift}{/Meta}');
    expect(fake.api.dismissReminderBanner).toHaveBeenCalled();
  });

  it('asks to archive every done task with ⌥⌘A', async () => {
    const { user } = await renderBoard(BUSY_BOARD());
    await user.keyboard('{Meta>}{Alt>}a{/Alt}{/Meta}');
    expect(screen.getByRole('alertdialog', { name: 'Archive all done tasks?' })).toBeTruthy();
  });

  it('installs a new version with ⌘I and puts it off with ⇧⌘L', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await user.keyboard('{Meta>}{Shift>}l{/Shift}{/Meta}');
    expect(screen.queryByRole('region', { name: 'New version of mboard' })).toBeNull();
    await user.keyboard('{Meta>}i{/Meta}');
    expect(fake.api.installAppUpdate).not.toHaveBeenCalled();
  });

  it('creates a task in To do from the New task dialog with ⌘↵ and cancels it with ⌘.', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await user.keyboard('{Meta>}n{/Meta}');
    await user.keyboard('{Meta>}[Period]{/Meta}');
    expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull();
    await user.keyboard('{Meta>}n{/Meta}');
    await user.keyboard('Write the brief');
    await user.keyboard('{Meta>}3{/Meta}');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(fake.api.createTask).toHaveBeenCalledOnce();
    expect(fake.api.createTask).toHaveBeenCalledWith(expect.objectContaining({ status: 'To do' }));
    expect(fake.api.moveTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull();
  });

  it('runs the Settings shortcuts only in Settings', async () => {
    const { user, fake } = await renderBoard(BUSY_BOARD());
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.keyboard('{Meta>}u{/Meta}');
    expect(fake.api.checkForAppUpdate).toHaveBeenCalledOnce();
    await user.keyboard('{Meta>}l{/Meta}');
    expect(fake.api.setOpenAtLogin).toHaveBeenCalledWith(false);
    await user.keyboard('{Meta>}o{/Meta}');
    expect(fake.api.chooseBoardFolder).toHaveBeenCalledOnce();
    expect(fake.api.openInObsidian).not.toHaveBeenCalled();
  });

  it('retries opening an unavailable board with ⌘R', async () => {
    const fake = createFakeMboard({ appState: { kind: 'unavailable', path: '/vault/Gone', reason: 'notFound' } });
    fake.install();
    render(<App />);
    await screen.findByRole('button', { name: 'Try again' });
    await act(async () => {
      await userEvent.keyboard('{Meta>}r{/Meta}');
    });
    expect(fake.api.retryOpenBoard).toHaveBeenCalledOnce();
  });
});
