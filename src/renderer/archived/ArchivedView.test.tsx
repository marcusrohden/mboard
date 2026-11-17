import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

const TASKS = () => [
  buildTask({ title: 'Live task', project: 'Acme' }),
  buildTask({ title: 'Older', status: 'Done', isArchived: true, archivedAt: '2026-11-01T10:00:00', project: 'Acme' }),
  buildTask({
    title: 'Newest',
    status: 'Done',
    isArchived: true,
    archivedAt: '2026-11-14T10:00:00',
    project: null,
    description: 'invoice sent',
  }),
  buildTask({ title: 'Undated', status: 'Done', isArchived: true, archivedAt: null, project: 'Other' }),
];

function rowTitles(): string[] {
  const table = screen.getByRole('table', { name: 'Archived tasks' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
}

describe('Archived view', () => {
  it('toggles with the Archived button and replaces the board', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    const toggle = screen.getByRole('button', { name: 'Archived' });
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('region', { name: 'To do' })).toBeNull();
    expect(screen.getByRole('table', { name: 'Archived tasks' })).toBeTruthy();
    await user.click(toggle);
    expect(screen.getByRole('region', { name: 'To do' })).toBeTruthy();
  });

  it('lists archived tasks newest first with project and archived date', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    expect(rowTitles()).toEqual(['Newest', 'Older', 'Undated']);
    const older = screen.getByRole('button', { name: 'Older' }).closest('tr')!;
    const cells = within(older)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual(['Older', 'Acme', '1 Nov 2026']);
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Title',
      'Project',
      'Archived',
    ]);
  });

  it('applies search and the Project filter but hides Due and Stale only', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    expect(screen.queryByRole('button', { name: 'Due' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Stale only' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Responsibility' })).toBeNull();

    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'invoice');
    expect(rowTitles()).toEqual(['Newest']);
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await user.click(screen.getByRole('button', { name: 'Project' }));
    await user.click(screen.getByRole('checkbox', { name: 'Acme' }));
    expect(rowTitles()).toEqual(['Older']);
    await user.click(screen.getByRole('checkbox', { name: 'Acme' }));
    await user.click(screen.getByRole('checkbox', { name: 'No project' }));
    expect(rowTitles()).toEqual(['Newest']);
  });

  it('keeps the search and filters when switching between the board and the archive', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'live');
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    expect(rowTitles()).toEqual([]);
    expect(screen.getByText('No archived tasks match.')).toBeTruthy();
  });

  it('says so when nothing is archived', async () => {
    const { user } = await renderBoard({ tasks: [buildTask({ title: 'Live' })] });
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    expect(screen.getByText('No archived tasks.')).toBeTruthy();
  });

  it('opens the drawer from a row and restores the task to the top of Done', async () => {
    const { user, fake } = await renderBoard({
      tasks: [...TASKS(), buildTask({ title: 'Already done', status: 'Done', order: 1 })],
    });
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    await user.click(screen.getByRole('button', { name: 'Newest' }));
    const drawer = screen.getByRole('complementary', { name: 'Task details' });
    expect((within(drawer).getByLabelText('Title') as HTMLInputElement).value).toBe('Newest');
    await user.click(within(drawer).getByRole('button', { name: 'Restore' }));
    expect(fake.api.restoreTask).toHaveBeenCalledWith('archive/Newest.md');
    await waitFor(() => expect(rowTitles()).toEqual(['Older', 'Undated']));
    await waitFor(() => expect(within(drawer).queryByRole('button', { name: 'Restore' })).toBeNull());
    expect(within(drawer).getByRole('button', { name: 'Archive' })).toBeTruthy();
    expect((within(drawer).getByLabelText('Title') as HTMLInputElement).readOnly).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Archived' }));
    const done = within(screen.getByRole('region', { name: 'Done' }));
    expect(done.getAllByRole('article').map((article) => article.getAttribute('aria-label'))).toEqual([
      'Newest',
      'Already done',
    ]);
  });
});
