import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildTask } from '../testing/builders';
import { useDomEnvironment } from '../testing/dom-environment';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

const TASKS = () => [
  buildTask({ title: 'Fix login', project: 'Acme', updated: '2026-11-12T10:00:00' }),
  buildTask({ title: 'Write docs', project: 'Acme' }),
  buildTask({ title: 'Shipped', project: 'Acme', status: 'Done', isArchived: true }),
  buildTask({ title: 'Plan trip', project: 'Beta' }),
];

async function openEditProject(user: Awaited<ReturnType<typeof renderBoard>>['user'], project: string) {
  await user.click(screen.getByRole('button', { name: 'Project' }));
  await user.click(screen.getByRole('button', { name: `Edit ${project}` }));
  return screen.getByRole('dialog', { name: 'Edit project' });
}

function nameInput(dialog: HTMLElement): HTMLInputElement {
  return within(dialog).getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
}

describe('Edit project', () => {
  it('opens from the pencil beside each project, but not beside No project', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('button', { name: 'Project' }));
    expect(screen.getByRole('button', { name: 'Edit Acme' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Beta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit No project' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit Acme' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    expect(nameInput(dialog).value).toBe('Acme');
    expect(document.activeElement).toBe(nameInput(dialog));
  });

  it("renames the project on every task, says what changes, and keeps each task's age", async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    const dialog = await openEditProject(user, 'Acme');
    await user.clear(nameInput(dialog));
    await user.type(nameInput(dialog), 'Globex');
    expect(within(dialog).getByText(/Renaming changes the project on 3 tasks, 1 of them archived\./)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: /^Save/ }));

    expect(fake.api.renameProject).toHaveBeenCalledWith('Acme', 'Globex');
    expect(screen.queryByRole('dialog', { name: 'Edit project' })).toBeNull();
    expect(fake.tasks().filter((task) => task.project === 'Globex')).toHaveLength(3);
    expect(fake.tasks().find((task) => task.title === 'Fix login')?.updated).toBe('2026-11-12T10:00:00');
    expect(await screen.findByText('Renamed Acme to Globex on 3 tasks.')).toBeTruthy();
  });

  it('carries a renamed project over in the project filter', async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('button', { name: 'Project' }));
    await user.click(screen.getByRole('checkbox', { name: 'Acme' }));
    await user.click(screen.getByRole('button', { name: 'Edit Acme' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    await user.clear(nameInput(dialog));
    await user.type(nameInput(dialog), 'Globex{Enter}');

    await user.click(screen.getByRole('button', { name: /^Project/ }));
    expect((screen.getByRole('checkbox', { name: 'Globex' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('checkbox', { name: 'Acme' })).toBeNull();
  });

  it("keeps an open task's details open as its file moves to the renamed project", async () => {
    const { user } = await renderBoard({ tasks: TASKS() });
    await user.click(screen.getByRole('article', { name: 'Fix login' }));
    expect(screen.getByRole('complementary', { name: 'Task details' })).toBeTruthy();
    await user.keyboard('{Meta>}{Shift>}p{/Shift}{/Meta}');
    screen.getByRole('button', { name: 'Edit Acme' }).focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    await user.clear(nameInput(dialog));
    await user.type(nameInput(dialog), 'Globex{Enter}');

    const drawer = screen.getByRole('complementary', { name: 'Task details' });
    expect((within(drawer).getByLabelText('Project') as HTMLInputElement).value).toBe('Globex');
    expect(screen.queryByText('That task is no longer on the board, so its details were closed.')).toBeNull();
  });

  it('asks before merging into a project that already has the new name, and can go back', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS(), projectColours: { Beta: 'blue' } });
    const dialog = await openEditProject(user, 'Acme');
    await user.clear(nameInput(dialog));
    await user.type(nameInput(dialog), 'beta{Enter}');

    const confirm = screen.getByRole('alertdialog', { name: 'Merge into Beta?' });
    expect(
      within(confirm).getByText(
        /Beta already has 1 task\. Merging moves Acme's tasks into it: 3 tasks, 1 of them archived\./,
      ),
    ).toBeTruthy();
    expect(fake.api.renameProject).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: /^Back/ }));
    expect(nameInput(screen.getByRole('dialog', { name: 'Edit project' })).value).toBe('beta');

    await user.click(screen.getByRole('button', { name: /^Save/ }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^Merge/ }));

    expect(fake.api.renameProject).toHaveBeenCalledWith('Acme', 'beta');
    expect(fake.api.setProjectColour).not.toHaveBeenCalled();
    expect(fake.tasks().filter((task) => task.project === 'Beta')).toHaveLength(4);
  });

  it('changes only the colour without renaming anything', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    const dialog = await openEditProject(user, 'Acme');
    await user.click(within(dialog).getByRole('radio', { name: 'Teal' }));
    await user.click(within(dialog).getByRole('button', { name: /^Save/ }));

    expect(fake.api.renameProject).not.toHaveBeenCalled();
    expect(fake.api.setProjectColour).toHaveBeenCalledWith('Acme', 'teal');
  });

  it('gives a renamed project the colour picked in the same save', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    const dialog = await openEditProject(user, 'Acme');
    await user.clear(nameInput(dialog));
    await user.type(nameInput(dialog), 'Globex');
    await user.click(within(dialog).getByRole('radio', { name: 'Pink' }));
    await user.click(within(dialog).getByRole('button', { name: /^Save/ }));

    expect(fake.api.setProjectColour).toHaveBeenCalledWith('Globex', 'pink');
  });

  it('asks for a name, and stays open when the rename fails', async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    const dialog = await openEditProject(user, 'Acme');
    await user.clear(nameInput(dialog));
    await user.click(within(dialog).getByRole('button', { name: /^Save/ }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Enter a name for the project.');

    fake.api.renameProject.mockRejectedValueOnce(new Error("That project's note couldn't be read."));
    await user.type(nameInput(dialog), 'Globex{Enter}');
    expect(await screen.findByText("That project's note couldn't be read.")).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Edit project' })).toBeTruthy();
  });

  it("opens the project's note in Obsidian", async () => {
    const { user, fake } = await renderBoard({ tasks: TASKS() });
    const dialog = await openEditProject(user, 'Acme');
    await user.click(within(dialog).getByRole('button', { name: /^Open note in Obsidian/ }));
    expect(fake.api.openProjectNote).toHaveBeenCalledWith('Acme');
  });
});
