import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

const TASKS = () => [
  buildTask({ title: 'Fix login', project: 'Acme', responsibility: 'Me', description: 'staging credentials', due: '2026-11-10' }),
  buildTask({ title: 'Write docs', project: 'Acme', responsibility: 'Client', due: '2026-11-16' }),
  buildTask({ title: 'Plan trip', project: null, responsibility: 'Internal', due: '2026-11-18' }),
  buildTask({ title: 'Old thing', project: 'Other', status: 'In progress', updated: '2026-11-01T09:00:00', due: null }),
  buildTask({ title: 'Shipped', project: 'Acme', status: 'Done' }),
];

function titles(column: string): string[] {
  return within(screen.getByRole('region', { name: column }))
    .queryAllByRole('article')
    .map((article) => article.getAttribute('aria-label') ?? '');
}

function countOf(column: string): string {
  const header = within(screen.getByRole('region', { name: column })).getByRole('heading', { name: column }).parentElement;
  return header?.querySelector('span')?.textContent ?? '';
}

describe('Header', () => {
  it('has the named controls, and Clear only while something is active', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    for (const name of ['New task', 'Archived', 'Project', 'Responsibility', 'Due']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('switch', { name: 'Stale only' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archived' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'x');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('searches title, description, comments and project, and shows "shown of total"', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    expect(countOf('To do')).toBe('3');
    const search = screen.getByRole('searchbox', { name: 'Search tasks' });
    await user.type(search, 'staging');
    expect(titles('To do')).toEqual(['Fix login']);
    expect(countOf('To do')).toBe('1 of 3');
    expect(countOf('Done')).toBe('0 of 1');
    await user.clear(search);
    await user.type(search, 'acme docs');
    expect(titles('To do')).toEqual(['Write docs']);
  });

  it('filters by project, including No project', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('button', { name: 'Project' }));
    await user.click(screen.getByRole('checkbox', { name: 'No project' }));
    expect(titles('To do')).toEqual(['Plan trip']);
    await user.click(screen.getByRole('checkbox', { name: 'Other' }));
    expect(titles('To do')).toEqual(['Plan trip']);
    expect(titles('In progress')).toEqual(['Old thing']);
    expect(countOf('To do')).toBe('1 of 3');
  });

  it('filters by responsibility', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('button', { name: 'Responsibility' }));
    await user.click(screen.getByRole('checkbox', { name: 'Client' }));
    expect(titles('To do')).toEqual(['Write docs']);
  });

  it('filters by due: overdue, today, this week and none', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    const chooseDue = async (label: string) => {
      await user.click(screen.getByRole('button', { name: 'Due' }));
      await user.click(screen.getByRole('radio', { name: label }));
    };
    await chooseDue('Overdue');
    expect(titles('To do')).toEqual(['Fix login']);
    await chooseDue('Due today');
    expect(titles('To do')).toEqual(['Write docs']);
    await chooseDue('Due this week');
    expect(titles('To do').sort()).toEqual(['Plan trip', 'Write docs']);
    await chooseDue('No due date');
    expect(titles('In progress')).toEqual(['Old thing']);
    expect(titles('To do')).toEqual([]);
    await chooseDue('Any');
    expect(titles('To do')).toHaveLength(3);
  });

  it('filters to stale tasks only', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('switch', { name: 'Stale only' }));
    expect(titles('To do')).toEqual([]);
    expect(titles('In progress')).toEqual(['Old thing']);
  });

  it('clears everything with Clear', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'login');
    await user.click(screen.getByRole('switch', { name: 'Stale only' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(titles('To do')).toHaveLength(3);
    expect((screen.getByRole('searchbox', { name: 'Search tasks' }) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('switch', { name: 'Stale only' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });
});

describe('Keyboard shortcuts', () => {
  it('focuses the search box with / without typing the slash', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.keyboard('/');
    const search = screen.getByRole('searchbox', { name: 'Search tasks' }) as HTMLInputElement;
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('');
  });

  it('opens New task with N, but not while typing', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'n');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(document.body);
    await user.keyboard('n');
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy();
  });

  it('ignores N with a modifier held', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.keyboard('{Meta>}n{/Meta}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
