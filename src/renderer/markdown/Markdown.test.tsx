import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { buildTask } from '../testing/builders';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

type User = Awaited<ReturnType<typeof renderBoard>>['user'];

async function openDrawer(description: string, comments = buildTask().comments) {
  const board = await renderBoard({ tasks: [buildTask({ title: 'Plan', description, comments })] });
  await board.user.click(screen.getByRole('article', { name: 'Plan' }));
  const drawer = screen.getByRole('complementary', { name: 'Task details' });
  return { ...board, drawer };
}

function renderedDescription(drawer: HTMLElement): HTMLElement {
  return within(drawer).getByRole('group', { name: 'Description' });
}

function descriptionSource(drawer: HTMLElement): HTMLTextAreaElement | null {
  return within(drawer).queryByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement | null;
}

async function openSource(user: User, drawer: HTMLElement): Promise<HTMLTextAreaElement> {
  await user.click(renderedDescription(drawer));
  const source = descriptionSource(drawer);
  if (source === null) throw new Error('The description did not open its source.');
  return source;
}

describe('Markdown in descriptions and comments', () => {
  it('renders a description as formatted markdown, keeping single line breaks', async () => {
    const { drawer } = await openDrawer(
      [
        '# Release',
        '',
        'Ship **v2** with _care_',
        'after the review',
        '',
        '- [x] Build',
        '- [ ] Announce',
        '',
        '| Step | Owner |',
        '| --- | --- |',
        '| QA | Sam |',
        '',
        'Run `pnpm make`.',
      ].join('\n'),
    );
    const view = renderedDescription(drawer);

    expect(within(view).getByRole('heading', { level: 1, name: 'Release' })).toBeTruthy();
    expect(view.querySelector('strong')?.textContent).toBe('v2');
    expect(view.querySelector('em')?.textContent).toBe('care');
    expect(view.querySelector('p br')).not.toBeNull();
    const checkboxes = within(view).getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.map((box) => [box.checked, box.disabled])).toEqual([
      [true, true],
      [false, true],
    ]);
    expect(within(view).getByRole('cell', { name: 'Sam' })).toBeTruthy();
    expect(view.querySelector('code')?.textContent).toBe('pnpm make');
    expect(descriptionSource(drawer)).toBeNull();
  });

  it('leaves out raw HTML tags, keeping the text between them, and shows images as links instead of loading them', async () => {
    const { drawer } = await openDrawer(
      'Hi <img src="x" onerror="alert(1)"> <script>alert(2)</script>\n\n![Diagram](https://example.com/d.png)',
    );
    const view = renderedDescription(drawer);

    expect(view.querySelector('img, script')).toBeNull();
    expect(view.textContent).not.toContain('onerror');
    expect(view.textContent).toContain('alert(2)');
    expect(within(view).getByRole('link', { name: 'Diagram' }).getAttribute('href')).toBe('https://example.com/d.png');
  });

  it('opens web, mail and Obsidian links through main, without opening the editor', async () => {
    const { user, fake, drawer } = await openDrawer(
      '[Docs](https://example.com/docs), [Mail](mailto:sam@example.com), [Note](obsidian://open?vault=W&file=N), [Local](notes/Plan.md), [Script](javascript:alert(1))',
    );
    const view = renderedDescription(drawer);

    await user.click(within(view).getByRole('link', { name: 'Docs' }));
    await user.click(within(view).getByRole('link', { name: 'Mail' }));
    await user.click(within(view).getByRole('link', { name: 'Note' }));

    expect(fake.api.openLink.mock.calls).toEqual([
      ['https://example.com/docs'],
      ['mailto:sam@example.com'],
      ['obsidian://open?vault=W&file=N'],
    ]);
    expect(descriptionSource(drawer)).toBeNull();
    expect(within(view).queryByRole('link', { name: 'Local' })).toBeNull();
    expect(within(view).queryByRole('link', { name: 'Script' })).toBeNull();
    expect(within(view).getByText('Script')).toBeTruthy();
  });

  it('renders comments as markdown in the drawer and in Previous comments', async () => {
    const { user, drawer } = await openDrawer('', [{ at: '2026-11-12 10:30', text: 'Sent **v2**\nto the client' }]);
    const comments = within(drawer).getByRole('region', { name: 'Comments' });
    expect(comments.querySelector('strong')?.textContent).toBe('v2');
    expect(comments.querySelector('br')).not.toBeNull();

    const addComment = screen.getByRole('button', { name: /^Add comment, 1 comment/ });
    await user.click(addComment);
    await user.click(addComment);
    const dialog = screen.getByRole('dialog', { name: 'Add comment' });
    const previous = within(dialog).getByRole('region', { name: 'Previous comments' });
    expect(previous.querySelector('strong')?.textContent).toBe('v2');
  });
});

describe('Click to edit', () => {
  it('opens the markdown source on a click with the caret at the end, and shows it rendered after ⌘↵', async () => {
    const { user, fake, drawer } = await openDrawer('Staging **fails**');

    const source = await openSource(user, drawer);
    expect(source.value).toBe('Staging **fails**');
    expect(document.activeElement).toBe(source);
    expect(source.selectionStart).toBe(source.value.length);

    await user.keyboard(' on Fridays{Meta>}{Enter}{/Meta}');

    expect(fake.api.editTask).toHaveBeenCalledWith('tasks/Plan.md', {
      field: 'description',
      value: 'Staging **fails** on Fridays',
    });
    await waitFor(() => expect(descriptionSource(drawer)).toBeNull());
    expect(document.activeElement).toBe(renderedDescription(drawer));
  });

  it('opens the source with Enter or Space on the focused rendered view, and Tab shows it rendered again', async () => {
    const { user, drawer } = await openDrawer('Notes');
    act(() => renderedDescription(drawer).focus());
    expect(descriptionSource(drawer)).toBeNull();

    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(descriptionSource(drawer));
    await user.tab();
    expect(descriptionSource(drawer)).toBeNull();

    act(() => renderedDescription(drawer).focus());
    await user.keyboard(' ');
    expect(descriptionSource(drawer)).not.toBeNull();
  });

  it('keeps the source while the press that took its focus is held, so the press lands where it was aimed', async () => {
    const { user, drawer } = await openDrawer('Notes');
    const source = await openSource(user, drawer);

    fireEvent.pointerDown(document.body);
    act(() => source.blur());
    expect(descriptionSource(drawer)).toBe(source);

    fireEvent.pointerUp(document.body);
    await waitFor(() => expect(descriptionSource(drawer)).toBeNull());
  });

  it('keeps the source when the window loses focus, so switching apps keeps the caret', async () => {
    const { user, drawer } = await openDrawer('Notes');
    const source = await openSource(user, drawer);
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);

    act(() => source.blur());
    hasFocus.mockRestore();

    expect(descriptionSource(drawer)).toBe(source);
  });

  it('shows an empty field as a textarea with its placeholder', async () => {
    const { drawer } = await openDrawer('');
    expect(descriptionSource(drawer)).not.toBeNull();
    expect(within(drawer).queryByRole('group', { name: 'Description' })).toBeNull();
  });
});
