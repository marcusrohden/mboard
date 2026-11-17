import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

async function openDialog(user: Awaited<ReturnType<typeof renderBoard>>['user']): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'New task' }));
  return screen.getByRole('dialog', { name: 'New task' });
}

describe('New task dialog', () => {
  it('has every field, starts in To do and has no responsibility control', async () => {
    const { user } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    const dialog = await openDialog(user);
    for (const label of ['Title', 'Column', 'Project', 'Due date', 'Description']) {
      expect(within(dialog).getByLabelText(label)).toBeTruthy();
    }
    expect((within(dialog).getByLabelText('Column') as HTMLSelectElement).value).toBe('To do');
    expect(within(dialog).queryByRole('radiogroup')).toBeNull();
    expect(within(dialog).queryByText('Responsibility')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Create task' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Title'));
  });

  it('creates a task with every field, then closes and shows it at the top of its column', async () => {
    const { user, fake } = await renderBoard({
      tasks: [buildTask({ title: 'Existing', status: 'In progress', order: 1, project: 'Acme website' })],
    });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText('Title'), '  Write the brief  ');
    await user.selectOptions(within(dialog).getByLabelText('Column'), 'In progress');
    await user.type(within(dialog).getByLabelText('Project'), '  Acme   website ');
    await user.type(within(dialog).getByLabelText('Due date'), '2026-11-20');
    await user.type(within(dialog).getByLabelText('Description'), 'Line one{Enter}Line two');
    await user.click(within(dialog).getByRole('button', { name: 'Create task' }));

    expect(fake.api.createTask).toHaveBeenCalledWith({
      title: 'Write the brief',
      status: 'In progress',
      project: 'Acme website',
      due: '2026-11-20',
      description: 'Line one\nLine two',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    const inProgress = screen.getByRole('region', { name: 'In progress' });
    expect(
      within(inProgress)
        .getAllByRole('article')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Write the brief', 'Existing']);
  });

  it('offers all five columns', async () => {
    const { user } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    const dialog = await openDialog(user);
    const select = within(dialog).getByLabelText('Column') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      'To do',
      'In progress',
      'Internal',
      'With client',
      'Done',
    ]);
  });

  it.each(['Internal', 'With client'] as const)('creates a task straight into %s', async (status) => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText('Title'), 'Waiting on someone');
    await user.selectOptions(within(dialog).getByLabelText('Column'), status);
    await user.click(within(dialog).getByRole('button', { name: 'Create task' }));

    expect(fake.api.createTask).toHaveBeenCalledWith({
      title: 'Waiting on someone',
      status,
      project: null,
      due: null,
      description: '',
    });
    const column = screen.getByRole('region', { name: status });
    expect(
      within(column)
        .getAllByRole('article')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Waiting on someone']);
  });

  it('creates with Enter in the title', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText('Title'), 'Quick one{Enter}');
    expect(fake.api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Quick one', status: 'To do', project: null, due: null }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('creates with Cmd+Enter from another field, and Enter elsewhere does not create', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText('Title'), 'From description');
    await user.type(within(dialog).getByLabelText('Project'), 'Acme{Enter}');
    expect(fake.api.createTask).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Description'), 'Notes{Meta>}{Enter}{/Meta}');
    expect(fake.api.createTask).toHaveBeenCalledOnce();
  });

  it('asks for a title instead of creating an empty task', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText('Title'), '   {Enter}');
    expect(fake.api.createTask).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert').textContent).toBe('Enter a title for the task.');
    expect(within(dialog).getByLabelText('Title').getAttribute('aria-invalid')).toBe('true');
  });

  it('cancels with Esc and with Cancel, creating nothing', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText('Title'), 'Never mind');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    const reopened = await openDialog(user);
    await user.click(within(reopened).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fake.api.createTask).not.toHaveBeenCalled();
  });

  it('offers existing projects as suggestions, archived ones included', async () => {
    const { user } = await renderBoard({
      tasks: [
        buildTask({ title: 'Live', project: 'Acme website' }),
        buildTask({ title: 'Gone', project: 'Old client', isArchived: true, status: 'Done' }),
      ],
    });
    const dialog = await openDialog(user);
    const list = within(dialog).getByLabelText('Project').getAttribute('list');
    const options = Array.from(document.querySelectorAll(`datalist[id="${list}"] option`)).map((option) =>
      option.getAttribute('value'),
    );
    expect(options.sort()).toEqual(['Acme website', 'Old client']);
  });

  it('stays open and shows a toast when the task is rejected', async () => {
    const { user, fake } = await renderBoard({ tasks: [buildTask({ title: 'Existing' })] });
    fake.api.createTask.mockRejectedValueOnce(new Error('The board folder is read-only.'));
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText('Title'), 'Doomed{Enter}');
    expect((await screen.findByText('The board folder is read-only.')).closest('[role="alert"]')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy();
    expect((within(dialog).getByLabelText('Title') as HTMLInputElement).value).toBe('Doomed');
  });
});
