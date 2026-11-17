import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
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

  it('keeps the article role on a task even with drag and drop attached', async () => {
    await renderBoard({ tasks: [buildTask({ title: 'Plain' })] });
    expect(screen.getByRole('article', { name: 'Plain' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Plain' })).toBeNull();
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

  it('marks a task in With client complete', async () => {
    const { user, fake } = await renderBoard({
      tasks: [
        buildTask({ title: 'Already done', status: 'Done', order: 1 }),
        buildTask({ title: 'Signed', status: 'With client' }),
      ],
    });
    await user.click(screen.getByRole('article', { name: 'Signed' }));
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Signed.md', 'Done', 'tasks/Already done.md');
    expect(titlesIn('Done')).toEqual(['Signed', 'Already done']);
    expect(titlesIn('With client')).toEqual([]);
  });

  it('puts a task at the top of Done with Mark complete', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'Already done', status: 'Done', order: 1 }), buildTask({ title: 'Doing' })],
    });
    await user.click(screen.getByRole('article', { name: 'Doing' }));
    await user.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(fake.api.moveTask).toHaveBeenCalledWith('tasks/Doing.md', 'Done', 'tasks/Already done.md');
    expect(titlesIn('Done')).toEqual(['Doing', 'Already done']);
  });
});
