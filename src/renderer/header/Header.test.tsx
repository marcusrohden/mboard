import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

const TASKS = () => [
  buildTask({ title: 'Fix login', project: 'Acme', description: 'staging credentials', due: '2026-11-10' }),
  buildTask({ title: 'Write docs', project: 'Acme', due: '2026-11-16' }),
  buildTask({ title: 'Plan trip', project: null, due: '2026-11-18' }),
  buildTask({ title: 'Old thing', project: 'Other', status: 'In progress', updated: '2026-11-01T09:00:00', due: null }),
  buildTask({ title: 'Shipped', project: 'Acme', status: 'Done' }),
];

function titles(column: string): string[] {
  return within(screen.getByRole('region', { name: column }))
    .queryAllByRole('article')
    .map((article) => article.getAttribute('aria-label') ?? '');
}

function countOf(column: string): string {
  const header = within(screen.getByRole('region', { name: column })).getByRole('heading', {
    name: column,
  }).parentElement;
  return header?.querySelector('span')?.textContent ?? '';
}

describe('Header', () => {
  it('has the named controls, and Clear only while something is active', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    for (const name of ['New task', 'Archived', 'Project', 'Due']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Responsibility' })).toBeNull();
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

  it('shows "shown of total" in Internal and With client too', async () => {
    const { user } = await renderBoard({
      tasks: [
        ...TASKS(),
        buildTask({ title: 'Chase design', project: 'Acme', status: 'Internal' }),
        buildTask({ title: 'Await sign-off', project: 'Acme', status: 'With client' }),
        buildTask({ title: 'Await quote', project: 'Other', status: 'With client' }),
      ],
    });
    expect(countOf('Internal')).toBe('1');
    expect(countOf('With client')).toBe('2');
    await user.click(screen.getByRole('button', { name: 'Project' }));
    await user.click(screen.getByRole('checkbox', { name: 'Other' }));
    expect(titles('With client')).toEqual(['Await quote']);
    expect(countOf('With client')).toBe('1 of 2');
    expect(countOf('Internal')).toBe('0 of 1');
    expect(within(screen.getByRole('region', { name: 'Internal' })).getByText('No matching tasks')).toBeTruthy();
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

  it('judges stale only by the thresholds from Settings', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('switch', { name: 'Stale only' }));
    expect(titles('In progress')).toEqual(['Old thing']);
    act(() => fake.pushAgeThresholds({ nudgeFrom: 97, stallingFrom: 98, staleFrom: 99 }));
    expect(titles('In progress')).toEqual([]);
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
  it('focuses the search box with ⌘F, and shows the key beside it', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    const search = screen.getByRole('searchbox', { name: 'Search tasks' }) as HTMLInputElement;
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Meta+F');
    await user.keyboard('{Meta>}f{/Meta}');
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('');
  });

  it('opens New task with ⌘N, even while typing in the search box', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'n');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.keyboard('{Meta>}n{/Meta}');
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy();
  });

  it('ignores single keys and Control chords', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(document.body);
    await user.keyboard('n/');
    await user.keyboard('{Control>}n{/Control}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).not.toBe(screen.getByRole('searchbox', { name: 'Search tasks' }));
  });

  it('toggles the archived view, Stale only and Clear, and opens the filters with focus on them', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.keyboard('{Meta>}{Shift>}s{/Shift}{/Meta}');
    expect((screen.getByRole('switch', { name: 'Stale only' }) as HTMLInputElement).checked).toBe(true);
    await user.keyboard('{Meta>}{Shift>}x{/Shift}{/Meta}');
    expect((screen.getByRole('switch', { name: 'Stale only' }) as HTMLInputElement).checked).toBe(false);

    await user.keyboard('{Meta>}{Shift>}p{/Shift}{/Meta}');
    const project = screen.getByRole('button', { name: 'Project' });
    expect(project.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(project);
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();

    await user.keyboard('{Meta>}{Shift>}e{/Shift}{/Meta}');
    expect(screen.getByRole('button', { name: 'Archived' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Open agent', () => {
  function openAgentButton(): HTMLButtonElement {
    return screen.getByRole('button', { name: 'Open agent' }) as HTMLButtonElement;
  }

  it('opens the agent from the header, showing ⇧⌘O', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    expect(openAgentButton().getAttribute('aria-keyshortcuts')).toBe('Shift+Meta+O');
    await user.click(openAgentButton());
    expect(fake.api.openAgent).toHaveBeenCalledOnce();
  });

  it('opens the agent with ⇧⌘O', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    await user.keyboard('{Meta>}{Shift>}o{/Shift}{/Meta}');
    expect(fake.api.openAgent).toHaveBeenCalledOnce();
  });

  it('is off while there is nothing in Done', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS().filter((task) => task.status !== 'Done') });
    expect(openAgentButton().disabled).toBe(true);
    expect(openAgentButton().title).toBe('No tasks in Done yet');
    await user.keyboard('{Meta>}{Shift>}o{/Shift}{/Meta}');
    expect(fake.api.openAgent).not.toHaveBeenCalled();
  });

  it('shows why the agent could not open', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    fake.api.openAgent.mockRejectedValueOnce(new Error("mboard couldn't open Ghostty."));
    await user.click(openAgentButton());
    expect((await screen.findByRole('alert')).textContent).toContain("mboard couldn't open Ghostty.");
    expect(openAgentButton().disabled).toBe(false);
  });
});
