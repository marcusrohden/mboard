import { screen, waitFor, within } from '@testing-library/react';
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
  it('shows three columns with their tasks as articles, sorted by order', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Second', order: 2 }),
        buildTask({ title: 'First', order: 1 }),
        buildTask({ title: 'Going', status: 'In progress' }),
        buildTask({ title: 'Finished', status: 'Done' }),
      ],
    });
    expect(titlesIn('To do')).toEqual(['First', 'Second']);
    expect(titlesIn('In progress')).toEqual(['Going']);
    expect(titlesIn('Done')).toEqual(['Finished']);
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

  it('shows the task title, project, responsibility and due chip', async () => {
    await renderBoard({
      tasks: [buildTask({ title: 'Ship it', project: 'Acme website', responsibility: 'Client', due: '2026-11-20' })],
    });
    const task = screen.getByRole('article', { name: 'Ship it' });
    expect(within(task).getByText('Acme website')).toBeTruthy();
    expect(within(task).getByText('Client').getAttribute('data-responsibility')).toBe('Client');
    expect(within(task).getByText('20 Nov').getAttribute('data-tone')).toBe('neutral');
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
  it('shows amber from 3 days, red from 7 days, and nothing in Done', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Fresh', updated: '2026-11-15T09:00:00' }),
        buildTask({ title: 'Amber', updated: '2026-11-13T09:00:00' }),
        buildTask({ title: 'Red', updated: '2026-11-09T09:00:00' }),
        buildTask({ title: 'Done old', status: 'Done', updated: '2026-11-01T09:00:00' }),
      ],
    });
    const edge = (title: string) => screen.getByRole('article', { name: title }).getAttribute('data-staleness');
    expect(edge('Fresh')).toBe('none');
    expect(edge('Amber')).toBe('amber');
    expect(edge('Red')).toBe('red');
    expect(edge('Done old')).toBe('none');
    expect(within(screen.getByRole('article', { name: 'Amber' })).getByText('3d')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Red' })).getByText('7d')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Fresh' })).queryByText(/^\d+d$/)).toBeNull();
    expect(within(screen.getByRole('article', { name: 'Done old' })).queryByText(/^\d+d$/)).toBeNull();
  });

  it('uses the snapshot date, not the real clock, for staleness', async () => {
    await renderBoard({
      today: '2030-01-10',
      now: '2030-01-10T10:00:00',
      tasks: [buildTask({ title: 'Ancient', updated: '2030-01-09T09:00:00' })],
    });
    expect(screen.getByRole('article', { name: 'Ancient' }).getAttribute('data-staleness')).toBe('none');
  });

  it('shows amber Today, red Overdue and neutral dates, and neutral in Done', async () => {
    await renderBoard({
      tasks: [
        buildTask({ title: 'Due today', due: '2026-11-16' }),
        buildTask({ title: 'Late', due: '2026-11-10' }),
        buildTask({ title: 'Later', due: '2026-12-01' }),
        buildTask({ title: 'Done late', status: 'Done', due: '2026-11-10' }),
      ],
    });
    const chip = (title: string) => within(screen.getByRole('article', { name: title })).getByText(/Today|Overdue|\d+ \w{3}/);
    expect(chip('Due today').textContent).toBe('Today');
    expect(chip('Due today').getAttribute('data-tone')).toBe('amber');
    expect(chip('Late').textContent).toBe('Overdue');
    expect(chip('Late').getAttribute('data-tone')).toBe('red');
    expect(chip('Later').textContent).toBe('1 Dec');
    expect(chip('Later').getAttribute('data-tone')).toBe('neutral');
    expect(chip('Done late').textContent).toBe('10 Nov');
    expect(chip('Done late').getAttribute('data-tone')).toBe('neutral');
  });
});

describe('Done tasks', () => {
  it('archives a task from its card button', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'Finished', status: 'Done' }), buildTask({ title: 'Open' })],
    });
    expect(within(screen.getByRole('article', { name: 'Open' })).queryByRole('button', { name: 'Archive' })).toBeNull();
    await user.click(within(screen.getByRole('article', { name: 'Finished' })).getByRole('button', { name: 'Archive' }));
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
