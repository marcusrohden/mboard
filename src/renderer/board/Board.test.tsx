import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
import { answerMoveComment, moveCommentDialog } from '../testing/move-comment';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

function column(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

function titlesIn(name: string): string[] {
  return within(column(name))
    .queryAllByRole('article')
    .map((article) => article.getAttribute('aria-label') ?? '');
}

describe('Board', () => {
  it('shows five columns in board order with their tasks as articles, sorted by order', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Second', order: 2 }),
        buildTask({ title: 'First', order: 1 }),
        buildTask({ title: 'Going', status: 'In progress' }),
        buildTask({ title: 'Asked the team', status: 'Internal' }),
        buildTask({ title: 'Sent the quote', status: 'With client', order: 2 }),
        buildTask({ title: 'Sent the draft', status: 'With client', order: 1 }),
        buildTask({ title: 'Finished', status: 'Done' }),
      ],
    });
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'To do',
      'In progress',
      'Internal',
      'With client',
      'Done',
    ]);
    expect(titlesIn('To do')).toEqual(['First', 'Second']);
    expect(titlesIn('In progress')).toEqual(['Going']);
    expect(titlesIn('Internal')).toEqual(['Asked the team']);
    expect(titlesIn('With client')).toEqual(['Sent the draft', 'Sent the quote']);
    expect(titlesIn('Done')).toEqual(['Finished']);
    expect(within(column('With client')).getByText('2')).toBeTruthy();
    expect(within(column('To do')).getByRole('heading', { name: 'To do' })).toBeTruthy();
    expect(within(column('To do')).getByText('2')).toBeTruthy();
  });

  it('always shows a comment button with the count, and a Complete or Archive button, in the top right', async () => {
    const comment = (text: string) => ({ at: '2026-11-12 10:00', text });
    await renderBoard({
      tasks: [
        buildTask({ title: 'Discussed', comments: [comment('One'), comment('Two'), comment('Three')] }),
        buildTask({ title: 'Noted', comments: [comment('Only')] }),
        buildTask({ title: 'Quiet' }),
        buildTask({ title: 'Shipped', status: 'Done' }),
      ],
    });
    const card = (title: string) => screen.getByRole('article', { name: title });
    const discussed = within(card('Discussed')).getByRole('button', { name: 'Add comment, 3 comments' });
    expect(discussed.textContent).toBe('3');
    expect(discussed.getAttribute('title')).toBe('3 comments · Add comment (⇧⌘C)');
    expect(discussed.getAttribute('aria-keyshortcuts')).toBe('Shift+Meta+C');
    expect(within(card('Noted')).getByRole('button', { name: 'Add comment, 1 comment' })).toBeTruthy();
    const quiet = within(card('Quiet')).getByRole('button', { name: 'Add comment' });
    expect(quiet.textContent).toBe('');
    expect(within(card('Quiet')).getByRole('button', { name: 'Complete' }).getAttribute('title')).toBe('Complete (⌘5)');
    expect(within(card('Shipped')).getByRole('button', { name: 'Archive' }).getAttribute('title')).toBe(
      'Archive (⇧⌘A)',
    );
  });

  it('keeps the article role on a task even with drag and drop attached', async () => {
    await renderBoard({ tasks: [buildTask({ title: 'Plain' })] });
    expect(screen.getByRole('article', { name: 'Plain' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Plain' })).toBeNull();
  });

  it('highlights no column and shows no drag preview while nothing is dragged', async () => {
    await renderBoard({
      tasks: [buildTask({ title: 'Resting' }), buildTask({ title: 'Waiting', status: 'Internal' })],
    });
    expect(document.querySelector('[data-drop-target]')).toBeNull();
    expect(document.querySelector('[data-drag-source]')).toBeNull();
    expect(document.querySelector('[data-dnd-overlay]')?.childElementCount).toBe(0);
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('invites the first task when the board is empty', async () => {
    const { user, fake } = await renderBoard();
    expect(screen.getByText('No tasks yet')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'New task' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]!);
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy();
    expect(fake.api.createTask).not.toHaveBeenCalled();
  });

  it('shows empty Internal and With client columns as drop targets', async () => {
    await renderBoard({ tasks: [buildTask({ title: 'Only one' })] });
    expect(within(column('Internal')).getByText('No tasks')).toBeTruthy();
    expect(within(column('With client')).getByText('No tasks')).toBeTruthy();
  });

  it('shows the task title, project and due date, and no responsibility', async () => {
    await renderBoard({
      tasks: [buildTask({ title: 'Ship it', project: 'Acme website', status: 'With client', due: '2026-11-20' })],
    });
    const task = screen.getByRole('article', { name: 'Ship it' });
    expect(within(task).getByText('Acme website')).toBeTruthy();
    expect(within(task).getByText('Due 20 Nov')).toBeTruthy();
    expect(task.querySelector('[data-tone]')).toBeNull();
    expect(document.querySelector('[data-responsibility]')).toBeNull();
    expect(screen.queryByText('Me')).toBeNull();
  });

  it('shows the project in its colour from projects.md, matched ignoring case, and plain without one', async () => {
    await renderBoard({
      projectColours: { 'Acme Website': 'teal' },
      tasks: [
        buildTask({ title: 'Coloured', project: 'acme website' }),
        buildTask({ title: 'Plain', project: 'Other' }),
      ],
    });
    const project = (title: string, name: string) =>
      within(screen.getByRole('article', { name: title })).getByText(name);
    expect(project('Coloured', 'acme website').getAttribute('data-colour')).toBe('teal');
    expect(project('Plain', 'Other').hasAttribute('data-colour')).toBe(false);
  });

  it('opens the detail on click and on Enter', async () => {
    const { user } = await renderBoard({ tasks: [buildTask({ title: 'Open me' })] });
    await user.click(screen.getByRole('article', { name: 'Open me' }));
    expect(screen.getByRole('complementary', { name: 'Task details' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Task details' })).toBeNull());
    screen.getByRole('article', { name: 'Open me' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('complementary', { name: 'Task details' })).toBeTruthy();
  });
});

describe('Task styling driven by the snapshot date', () => {
  it('colours the age chip and the left edge by working days since the update, and Done grey', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Fresh', updated: '2026-11-13T09:00:00' }),
        buildTask({ title: 'Nudge', updated: '2026-11-12T09:00:00' }),
        buildTask({ title: 'Stalling', updated: '2026-11-10T09:00:00' }),
        buildTask({ title: 'Stale', updated: '2026-11-06T09:00:00' }),
        buildTask({ title: 'Done old', status: 'Done', updated: '2026-11-01T09:00:00' }),
      ],
    });
    const card = (title: string) => screen.getByRole('article', { name: title });
    const chip = (title: string) => within(card(title)).getByText(/^\d+d$/).parentElement;
    const expected = [
      ['Fresh', 'green', '1d'],
      ['Nudge', 'amber', '2d'],
      ['Stalling', 'orange', '4d'],
      ['Stale', 'red', '6d'],
      ['Done old', 'grey', '11d'],
    ] as const;
    for (const [title, level, label] of expected) {
      expect(card(title).getAttribute('data-staleness')).toBe(level);
      expect(chip(title)?.getAttribute('data-staleness')).toBe(level);
      expect(within(card(title)).getByText(/^\d+d$/).textContent).toBe(label);
    }
  });

  it('shows the created and updated dates on lines of their own, with the full times and the tier in the tooltip', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Nudge', created: '2026-11-10T08:00:00', updated: '2026-11-12T09:12:30' }),
        buildTask({
          title: 'Last year',
          status: 'Done',
          created: '2025-12-30T16:45:00',
          updated: '2026-11-16T09:00:00',
        }),
      ],
    });
    const nudge = screen.getByRole('article', { name: 'Nudge' });
    const created = within(nudge).getByText('Created 10 Nov');
    const updated = within(nudge).getByText('Updated 12 Nov');
    expect(created.parentElement).not.toBe(updated.parentElement);
    expect(created.parentElement?.parentElement).toBe(updated.parentElement?.parentElement);
    const tooltip = 'Created 10 Nov 08:00 · Updated 12 Nov 09:12 — 2 working days, Needs a nudge';
    expect(within(nudge).getByTitle(tooltip).textContent).toContain('2d');
    expect(within(nudge).getByText(tooltip).className).toBe('visually-hidden');
    const lastYear = screen.getByRole('article', { name: 'Last year' });
    expect(within(lastYear).getByText('Created 30 Dec 2025')).toBeTruthy();
    expect(within(lastYear).getByText('Updated 16 Nov')).toBeTruthy();
    expect(
      within(lastYear).getByTitle('Created 30 Dec 2025 16:45 · Updated 16 Nov 09:00 — 0 working days, Complete'),
    ).toBeTruthy();
  });

  it('colours by the thresholds from Settings and follows a change to them', async () => {
    const { fake } = await renderBoard({
      ageThresholds: { nudgeFrom: 3, stallingFrom: 5, staleFrom: 8 },
      tasks: [buildTask({ title: 'Two days', updated: '2026-11-12T09:00:00' })],
    });
    const card = () => screen.getByRole('article', { name: 'Two days' });
    await waitFor(() => expect(card().getAttribute('data-staleness')).toBe('green'));
    act(() => fake.pushAgeThresholds({ nudgeFrom: 1, stallingFrom: 2, staleFrom: 3 }));
    expect(card().getAttribute('data-staleness')).toBe('orange');
    expect(within(card()).getByTitle(/2 working days, Stalling$/)).toBeTruthy();
  });

  it('uses the snapshot date, not the real clock, for staleness', async () => {
    await renderBoard({
      today: '2030-01-10',
      now: '2030-01-10T10:00:00',
      tasks: [buildTask({ title: 'Future', updated: '2030-01-07T09:00:00' })],
    });
    expect(screen.getByRole('article', { name: 'Future' }).getAttribute('data-staleness')).toBe('amber');
    expect(within(screen.getByRole('article', { name: 'Future' })).getByText('3d')).toBeTruthy();
  });

  it('always shows the due date, with amber Today or red Overdue beside it, and no chip in Done', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Due today', due: '2026-11-16' }),
        buildTask({ title: 'Late', due: '2026-11-10' }),
        buildTask({ title: 'Later', due: '2026-12-01' }),
        buildTask({ title: 'Next year', due: '2027-01-05' }),
        buildTask({ title: 'Done late', status: 'Done', due: '2026-11-10' }),
      ],
    });
    const card = (title: string) => within(screen.getByRole('article', { name: title }));
    const chip = (title: string) => card(title).queryByText(/^(Today|Overdue)$/);
    expect(card('Due today').getByText('Due 16 Nov')).toBeTruthy();
    expect(chip('Due today')?.getAttribute('data-tone')).toBe('amber');
    expect(card('Late').getByText('Due 10 Nov')).toBeTruthy();
    expect(chip('Late')?.textContent).toBe('Overdue');
    expect(chip('Late')?.getAttribute('data-tone')).toBe('red');
    expect(card('Later').getByText('Due 1 Dec')).toBeTruthy();
    expect(chip('Later')).toBeNull();
    expect(card('Next year').getByText('Due 5 Jan 2027')).toBeTruthy();
    expect(card('Done late').getByText('Due 10 Nov')).toBeTruthy();
    expect(chip('Done late')).toBeNull();
  });
});

describe('Done tasks', () => {
  it('archives a task from its card button', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'Finished', status: 'Done' }), buildTask({ title: 'Open' })],
    });
    expect(within(screen.getByRole('article', { name: 'Open' })).queryByRole('button', { name: 'Archive' })).toBeNull();
    await user.click(
      within(screen.getByRole('article', { name: 'Finished' })).getByRole('button', { name: 'Archive' }),
    );
    expect(fake.api.archiveTask).toHaveBeenCalledWith('tasks/Finished.md');
    expect(screen.queryByRole('article', { name: 'Finished' })).toBeNull();
  });

  it('confirms before archiving everything in Done', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'A', status: 'Done' }), buildTask({ title: 'B', status: 'Done' })],
    });
    await user.click(within(column('Done')).getByRole('button', { name: 'Archive all' }));
    const dialog = screen.getByRole('alertdialog');
    expect(fake.api.archiveAllDone).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fake.api.archiveAllDone).not.toHaveBeenCalled();

    await user.click(within(column('Done')).getByRole('button', { name: 'Archive all' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive all' }));
    expect(fake.api.archiveAllDone).toHaveBeenCalledOnce();
    expect(await screen.findByText('No tasks yet')).toBeTruthy();
  });

  it('offers Archive all and the card Archive button only in Done', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Team', status: 'Internal' }),
        buildTask({ title: 'Client', status: 'With client' }),
        buildTask({ title: 'Shipped', status: 'Done' }),
      ],
    });
    for (const name of ['To do', 'In progress', 'Internal', 'With client']) {
      expect(within(column(name)).queryByRole('button', { name: 'Archive all' })).toBeNull();
      expect(within(column(name)).queryByRole('button', { name: 'Archive' })).toBeNull();
    }
    expect(within(column('Done')).getByRole('button', { name: 'Archive all' })).toBeTruthy();
    expect(within(column('Done')).getByRole('button', { name: 'Archive' })).toBeTruthy();
  });

  it('offers Complete, with the ⌘5 hint, on every card that is not in Done', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Waiting', status: 'To do' }),
        buildTask({ title: 'Team', status: 'Internal' }),
        buildTask({ title: 'Shipped', status: 'Done' }),
      ],
    });
    for (const title of ['Waiting', 'Team']) {
      const complete = within(screen.getByRole('article', { name: title })).getByRole('button', { name: 'Complete' });
      expect(complete.getAttribute('aria-keyshortcuts')).toBe('Meta+5');
    }
    expect(
      within(screen.getByRole('article', { name: 'Shipped' })).queryByRole('button', { name: 'Complete' }),
    ).toBeNull();
  });

  it('marks a task in With client complete', async () => {
    const { user, fake } = await renderBoard({
      tasks: [
        buildTask({ title: 'Already done', status: 'Done', order: 1 }),
        buildTask({ title: 'Signed', status: 'With client' }),
      ],
    });
    await user.click(screen.getByRole('article', { name: 'Signed' }));
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    await answerMoveComment(user, 'Done', 'Client signed off');
    expect(fake.api.moveTask).toHaveBeenCalledWith(
      'tasks/Signed.md',
      'Done',
      'tasks/Already done.md',
      'Client signed off',
    );
    expect(titlesIn('Done')).toEqual(['Signed', 'Already done']);
    expect(titlesIn('With client')).toEqual([]);
  });

  it('puts a task at the top of Done with Mark complete', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'Already done', status: 'Done', order: 1 }), buildTask({ title: 'Doing' })],
    });
    await user.click(screen.getByRole('article', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    await answerMoveComment(user, 'Done');
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Doing.md', 'Done', 'tasks/Already done.md', null);
    expect(titlesIn('Done')).toEqual(['Doing', 'Already done']);
  });
});

describe('A comment on a move', () => {
  function completeButtonOf(title: string): HTMLElement {
    return within(screen.getByRole('article', { name: title })).getByRole('button', { name: 'Complete' });
  }

  it('asks for a comment when Complete is pressed, then moves the task to the top of Done with it', async () => {
    const { user, fake } = await renderBoard({
      tasks: [
        buildTask({ title: 'Already done', status: 'Done', order: 1 }),
        buildTask({ title: 'Report', status: 'In progress' }),
      ],
    });
    await user.click(completeButtonOf('Report'));

    const dialog = await moveCommentDialog('Done');
    expect(within(dialog).getByText('“Report” moves from In progress to Done.')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Comment (optional)'));
    expect(screen.queryByRole('complementary', { name: 'Task details' })).toBeNull();
    expect(fake.api.moveTask).not.toHaveBeenCalled();

    await user.keyboard('Sent the monthly report{Enter}');
    expect(fake.api.moveTask).toHaveBeenCalledWith(
      'tasks/Report.md',
      'Done',
      'tasks/Already done.md',
      'Sent the monthly report',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(titlesIn('Done')).toEqual(['Report', 'Already done']);
    expect(
      fake
        .tasks()
        .find((task) => task.title === 'Report')
        ?.comments.map((comment) => comment.text),
    ).toEqual(['Sent the monthly report']);
  });

  it('does not list the previous comments in the move dialog', async () => {
    const { user } = await renderBoard({
      tasks: [
        buildTask({ title: 'Report', status: 'Internal', comments: [{ at: '2026-11-12 10:00', text: 'Earlier' }] }),
      ],
    });
    await user.click(completeButtonOf('Report'));
    const dialog = await moveCommentDialog('Done');
    expect(within(dialog).queryByRole('region', { name: 'Previous comments' })).toBeNull();
    expect(within(dialog).queryByText('Earlier')).toBeNull();
  });

  it('moves without a comment when the box is left empty', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report', status: 'Internal' })] });
    await user.click(completeButtonOf('Report'));
    await user.click(within(await moveCommentDialog('Done')).getByRole('button', { name: 'Move' }));
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Report.md', 'Done', null, null);
  });

  it('starts a new line with Shift+Enter instead of moving', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report', status: 'With client' })] });
    await user.click(completeButtonOf('Report'));
    await moveCommentDialog('Done');
    await user.keyboard('First line{Shift>}{Enter}{/Shift}Second line');
    expect(fake.api.moveTask).not.toHaveBeenCalled();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Report.md', 'Done', null, 'First line\nSecond line');
  });

  it.each([
    ['Esc', '{Escape}'],
    ['⌘.', '{Meta>}[Period]{/Meta}'],
  ])('leaves the task where it was when cancelled with %s', async (_name, keys) => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report', status: 'In progress' })] });
    await user.click(completeButtonOf('Report'));
    await moveCommentDialog('Done');
    await user.keyboard(`Half typed${keys}`);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.api.moveTask).not.toHaveBeenCalled();
    expect(titlesIn('In progress')).toEqual(['Report']);
  });

  it('leaves the task where it was when Cancel is pressed', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report', status: 'In progress' })] });
    await user.click(completeButtonOf('Report'));
    await user.click(within(await moveCommentDialog('Done')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.api.moveTask).not.toHaveBeenCalled();
  });

  it('keeps the dialog and the comment when the move fails, so it can be tried again', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report', status: 'In progress' })] });
    fake.api.moveTask.mockRejectedValueOnce(new Error('The file is locked.'));
    await user.click(completeButtonOf('Report'));
    const dialog = await moveCommentDialog('Done');
    await user.keyboard('Shipped{Enter}');

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('The file is locked.'),
    );
    expect((within(dialog).getByLabelText('Comment (optional)') as HTMLTextAreaElement).value).toBe('Shipped');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(fake.api.moveTask).toHaveBeenLastCalledWith('tasks/Report.md', 'Done', null, 'Shipped');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Adding a comment from a card', () => {
  it('opens a comment dialog from the speech bubble, and adds the comment with Enter', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report', status: 'Internal' })] });
    await user.click(
      within(screen.getByRole('article', { name: 'Report' })).getByRole('button', { name: 'Add comment' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Add comment' });
    expect(within(dialog).getByText('On “Report”.')).toBeTruthy();
    expect(within(dialog).queryByRole('region', { name: 'Previous comments' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Task details' })).toBeNull();
    expect((within(dialog).getByRole('button', { name: 'Add comment' }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Enter}');
    expect(fake.api.addComment).not.toHaveBeenCalled();

    await user.keyboard('Waiting on Sam{Shift>}{Enter}{/Shift}for the figures{Enter}');
    expect(fake.api.addComment).toHaveBeenCalledWith('tasks/Report.md', 'Waiting on Sam\nfor the figures');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      within(screen.getByRole('article', { name: 'Report' })).getByRole('button', { name: 'Add comment, 1 comment' }),
    ).toBeTruthy();
  });

  it('lists the previous comments under the box, newest first, and still adds with Enter', async () => {
    const { user, fake } = await renderBoard({
      tasks: [
        buildTask({
          title: 'Report',
          comments: [
            { at: '2026-11-12 10:00', text: 'Asked for the figures' },
            { at: '2026-11-14 09:30', text: 'Figures arrived' },
            { at: '2026-11-10 08:00', text: 'Started the draft' },
          ],
        }),
      ],
    });
    await user.click(
      within(screen.getByRole('article', { name: 'Report' })).getByRole('button', { name: 'Add comment, 3 comments' }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Add comment' });
    const previous = within(dialog).getByRole('region', { name: 'Previous comments' });
    expect(
      within(previous)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent),
    ).toEqual(['Figures arrived', 'Asked for the figures', 'Started the draft']);
    expect(within(previous).getByText('14 Nov 2026, 09:30')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Comment'));

    await user.keyboard('Sent to the client{Enter}');
    expect(fake.api.addComment).toHaveBeenCalledWith('tasks/Report.md', 'Sent to the client');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the previous comments up to date while the dialog is open, and closes when the task is archived', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'Report', comments: [{ at: '2026-11-12 10:00', text: 'First' }] })],
    });
    await user.click(
      within(screen.getByRole('article', { name: 'Report' })).getByRole('button', { name: 'Add comment, 1 comment' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add comment' });
    await user.keyboard('Half typed');

    const [report] = fake.tasks();
    act(() =>
      fake.setTasks([
        { ...report!, comments: [...report!.comments, { at: '2026-11-13 11:00', text: 'From Obsidian' }] },
      ]),
    );
    const previous = within(dialog).getByRole('region', { name: 'Previous comments' });
    await waitFor(() =>
      expect(
        within(previous)
          .getAllByRole('listitem')
          .map((item) => item.querySelector('p')?.textContent),
      ).toEqual(['From Obsidian', 'First']),
    );
    expect((within(dialog).getByLabelText('Comment') as HTMLTextAreaElement).value).toBe('Half typed');

    act(() => fake.setTasks([{ ...fake.tasks()[0]!, isArchived: true }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens it with ⇧⌘C on the focused card, and cancels with Esc', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report' })] });
    screen.getByRole('article', { name: 'Report' }).focus();
    await user.keyboard('{Meta>}{Shift>}c{/Shift}{/Meta}');
    await screen.findByRole('dialog', { name: 'Add comment' });
    await user.keyboard('Never mind{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.api.addComment).not.toHaveBeenCalled();
  });

  it('keeps the dialog and the text when the comment fails, so it can be tried again', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report' })] });
    fake.api.addComment.mockRejectedValueOnce(new Error('The file is locked.'));
    await user.click(
      within(screen.getByRole('article', { name: 'Report' })).getByRole('button', { name: 'Add comment' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add comment' });
    await user.keyboard('Called the client{Enter}');

    expect((await screen.findByRole('alert')).textContent).toContain('The file is locked.');
    expect((within(dialog).getByLabelText('Comment') as HTMLTextAreaElement).value).toBe('Called the client');
  });
});

describe('Deleting a task from a card', () => {
  function deleteButton(title: string): HTMLElement {
    return within(screen.getByRole('article', { name: title })).getByRole('button', { name: 'Delete' });
  }

  it('shows a Delete button with its ⇧⌘⌫ shortcut on every card, Done included', async () => {
    await renderBoard({
      tasks: [buildTask({ title: 'Open' }), buildTask({ title: 'Shipped', status: 'Done' })],
    });
    for (const title of ['Open', 'Shipped']) {
      expect(deleteButton(title).getAttribute('title')).toBe('Delete (⇧⌘⌫)');
      expect(deleteButton(title).getAttribute('aria-keyshortcuts')).toBe('Shift+Meta+Backspace');
    }
  });

  it('asks first, without opening the drawer, and deletes only when confirmed', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'Report' }), buildTask({ title: 'Other' })],
    });
    await user.click(deleteButton('Report'));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete task?' });
    expect(dialog.textContent).toContain('"Report" will be moved to the Trash.');
    expect(screen.queryByRole('complementary', { name: 'Task details' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fake.api.deleteTask).not.toHaveBeenCalled();

    await user.click(deleteButton('Report'));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(fake.api.deleteTask).toHaveBeenCalledWith('tasks/Report.md');
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Report' })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('article', { name: 'Other' })).toBeTruthy();
  });

  it('closes the confirmation when the task goes away while it is open', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Report' })] });
    await user.click(deleteButton('Report'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    act(() => fake.setTasks([]));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fake.api.deleteTask).not.toHaveBeenCalled();
  });
});
