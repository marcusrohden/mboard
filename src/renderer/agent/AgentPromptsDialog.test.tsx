import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  addAgentPrompt,
  addAgentPromptVersion,
  latestVersion,
  selectAgentPrompt,
  startAgentPromptLibrary,
  type AgentPromptLibrary,
} from '../../domain';
import { buildTask, TEST_NOW } from '../testing/builders';
import { useDomEnvironment } from '../testing/dom-environment';
import type { FakeMboardOptions } from '../testing/fake-mboard';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

const SAVED_AT = new Date(TEST_NOW);
const TIMESHEET_TEXT = ['List my work by project.', 'Use one line per task.', 'Keep it short.'].join('\n');

function prompts(): AgentPromptLibrary {
  const started = startAgentPromptLibrary('timesheet', TIMESHEET_TEXT, SAVED_AT);
  const withStandup = addAgentPrompt(started, 'standup', { name: 'Standup', text: 'Summarise yesterday.' }, SAVED_AT);
  return selectAgentPrompt(withStandup, 'timesheet');
}

const TASKS = () => [buildTask({ title: 'Shipped', project: 'Acme', status: 'Done' })];

async function openDialog(options: FakeMboardOptions = {}) {
  const board = await renderBoard({ tasks: TASKS(), agentPrompts: prompts(), ...options });
  await board.user.click(screen.getByRole('button', { name: 'Open agent' }));
  const dialog = await screen.findByRole('dialog', { name: 'Open agent' });
  await waitFor(promptField);
  return { ...board, dialog };
}

/** The prompt's text field: its textarea while it is edited or empty, otherwise its rendered view. */
function promptField(): HTMLElement {
  const dialog = within(screen.getByRole('dialog', { name: 'Open agent' }));
  return dialog.queryByRole('textbox', { name: 'Prompt' }) ?? dialog.getByRole('group', { name: 'Prompt' });
}

/** The prompt's text as shown: the textarea's markdown, or the rendered view's text, line breaks included. */
function promptValue(): string {
  const field = promptField();
  return field instanceof HTMLTextAreaElement ? field.value : (field.textContent ?? '');
}

function nameInput(): HTMLInputElement {
  return within(screen.getByRole('dialog', { name: 'Open agent' })).getByRole('textbox', {
    name: 'Name',
  }) as HTMLInputElement;
}

function sidebarButton(name: RegExp): HTMLElement {
  const sidebar = within(screen.getByRole('dialog', { name: 'Open agent' })).getByRole('navigation', {
    name: 'Saved prompts',
  });
  return within(sidebar).getByRole('button', { name });
}

function dialogButton(name: RegExp): HTMLButtonElement {
  return within(screen.getByRole('dialog', { name: 'Open agent' })).getByRole('button', { name }) as HTMLButtonElement;
}

function diffLinesOf(group: HTMLElement): string[] {
  return Array.from(group.querySelectorAll('[data-kind]')).map((line) => {
    const sign = line.children[2]?.textContent ?? '';
    const text = line.children[3]?.textContent?.replace(/^(Added|Removed): /, '') ?? '';
    return `${sign}${text}`;
  });
}

describe('Open agent dialog', () => {
  it('opens on the selected prompt, with the saved prompts in the sidebar and focus in the prompt', async () => {
    const { dialog } = await openDialog();
    expect(promptValue()).toBe(TIMESHEET_TEXT);
    expect(nameInput().value).toBe('Default prompt');
    expect(document.activeElement).toBe(promptField());
    expect(sidebarButton(/^Default prompt/).getAttribute('aria-current')).toBe('true');
    expect(sidebarButton(/^Standup/).getAttribute('aria-current')).toBeNull();
    expect(within(dialog).getByText('The agent starts with the prompt, then the 1 task in Done.')).toBeTruthy();
  });

  it('opens the agent with the saved prompt on ⌘↵, then closes', async () => {
    const { user, fake } = await openDialog();
    expect(dialogButton(/^Open agent/).getAttribute('aria-keyshortcuts')).toBe('Meta+Enter');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(fake.api.openAgent).toHaveBeenCalledWith('timesheet');
    expect(screen.queryByRole('dialog', { name: 'Open agent' })).toBeNull();
  });

  it('stays open and says why when the agent could not open', async () => {
    const { user, fake } = await openDialog();
    fake.api.openAgent.mockRejectedValueOnce(new Error("mboard couldn't open Ghostty."));
    await user.click(dialogButton(/^Open agent/));
    expect((await screen.findByRole('alert')).textContent).toContain("mboard couldn't open Ghostty.");
    expect(screen.getByRole('dialog', { name: 'Open agent' })).toBeTruthy();
    expect(dialogButton(/^Open agent/).disabled).toBe(false);
  });

  it('keeps Open agent off with nothing in Done, while the prompts can still be edited', async () => {
    const { user, fake } = await openDialog({ tasks: [] });
    expect(dialogButton(/^Open agent/).disabled).toBe(true);
    expect(dialogButton(/^Open agent/).title).toBe('No tasks in Done yet');
    await user.type(promptField(), '\nAnd add totals.');
    await user.keyboard('{Meta>}s{/Meta}');
    expect(fake.api.saveAgentPrompt).toHaveBeenCalledWith('timesheet', {
      name: 'Default prompt',
      text: `${TIMESHEET_TEXT}\nAnd add totals.`,
    });
  });

  it('shows another prompt from the sidebar and opens on it next time', async () => {
    const { user, fake } = await openDialog();
    await user.click(sidebarButton(/^Standup/));
    expect(promptValue()).toBe('Summarise yesterday.');
    expect(fake.api.selectAgentPrompt).toHaveBeenCalledWith('standup');

    await user.keyboard('{Meta>}[Period]{/Meta}');
    await user.click(screen.getByRole('button', { name: 'Open agent' }));
    await screen.findByRole('dialog', { name: 'Open agent' });
    await screen.findByRole('dialog', { name: 'Open agent' });
    await waitFor(promptField);
    expect(promptValue()).toBe('Summarise yesterday.');
  });

  it('shows unsaved changes as a git-style diff against the saved prompt', async () => {
    const { user, dialog } = await openDialog();
    expect(within(dialog).queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    await user.click(promptField());
    await user.clear(promptField());
    await user.type(promptField(), 'List my work by project.\nUse one line per task, with the date.\nKeep it short.');

    const changes = within(dialog).getByRole('region', { name: 'Unsaved changes' });
    expect(within(changes).getByText('Unsaved changes · Save adds version 2')).toBeTruthy();
    expect(within(changes).getByText('@@ -1,3 +1,3 @@')).toBeTruthy();
    expect(diffLinesOf(changes)).toEqual([
      ' List my work by project.',
      '−Use one line per task.',
      '+Use one line per task, with the date.',
      ' Keep it short.',
    ]);
    expect(sidebarButton(/^Default prompt, unsaved changes$/).textContent).toContain('Edited');
  });

  describe('with unsaved changes', () => {
    async function openEdited() {
      const opened = await openDialog();
      await opened.user.type(promptField(), '\nAdd totals.');
      return opened;
    }

    it('asks before showing another prompt, and Save adds a version first', async () => {
      const { user, fake } = await openEdited();
      await user.click(sidebarButton(/^Standup/));
      const ask = screen.getByRole('alertdialog', { name: 'Save changes to “Default prompt”?' });
      expect(within(ask).getByText(/Save your changes as version 2 before showing another prompt\?/)).toBeTruthy();

      await user.click(within(ask).getByRole('button', { name: /^Save/ }));

      expect(fake.api.saveAgentPrompt).toHaveBeenCalledWith('timesheet', {
        name: 'Default prompt',
        text: `${TIMESHEET_TEXT}\nAdd totals.`,
      });
      expect(promptValue()).toBe('Summarise yesterday.');
      const timesheet = fake.agentPrompts().prompts.find((prompt) => prompt.id === 'timesheet');
      expect(timesheet?.versions.map((version) => version.number)).toEqual([1, 2]);
    });

    it("drops the changes with Don't save (⌘D)", async () => {
      const { user, fake } = await openEdited();
      await user.click(sidebarButton(/^Standup/));
      await user.keyboard('{Meta>}d{/Meta}');
      expect(promptValue()).toBe('Summarise yesterday.');
      expect(fake.api.saveAgentPrompt).not.toHaveBeenCalled();

      await user.click(sidebarButton(/^Default prompt/));
      expect(promptValue()).toBe(TIMESHEET_TEXT);
    });

    it('keeps the changes with Cancel', async () => {
      const { user } = await openEdited();
      await user.click(sidebarButton(/^Standup/));
      await user.keyboard('{Meta>}[Period]{/Meta}');
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(promptValue()).toBe(`${TIMESHEET_TEXT}\nAdd totals.`);
    });

    it('asks before closing with Esc', async () => {
      const { user, fake } = await openEdited();
      await user.keyboard('{Escape}');
      const ask = screen.getByRole('alertdialog', { name: 'Save changes to “Default prompt”?' });
      await user.click(within(ask).getByRole('button', { name: /^Don't save/ }));
      expect(screen.queryByRole('dialog', { name: 'Open agent' })).toBeNull();
      expect(fake.api.saveAgentPrompt).not.toHaveBeenCalled();
    });

    it('asks before opening the agent, and saving opens it with the new version', async () => {
      const { user, fake } = await openEdited();
      await user.click(dialogButton(/^Open agent/));
      const ask = screen.getByRole('alertdialog', { name: 'Save changes to “Default prompt”?' });
      expect(within(ask).getByText(/the agent opens with version 1\./)).toBeTruthy();
      await user.keyboard('{Meta>}{Enter}{/Meta}');
      expect(fake.api.saveAgentPrompt).toHaveBeenCalledOnce();
      expect(fake.api.openAgent).toHaveBeenCalledWith('timesheet');
      expect(screen.queryByRole('dialog', { name: 'Open agent' })).toBeNull();
    });
  });

  it('lists every version with its diff, and restores an earlier one as a new version', async () => {
    const edited = addAgentPromptVersion(
      prompts(),
      'timesheet',
      { name: 'Timesheet', text: 'List my work by project.\nKeep it short.' },
      SAVED_AT,
    );
    const { user, fake, dialog } = await openDialog({ agentPrompts: edited });

    await user.keyboard('{Meta>}{Shift>}h{/Shift}{/Meta}');
    const versions = within(dialog).getByRole('list', { name: 'Versions of Timesheet' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    const toggles = within(versions)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-expanded'));
    expect(toggles.map((toggle) => toggle.textContent)).toEqual([
      'Version 2Current16 Nov 10:00+0 −1',
      'Version 116 Nov 10:00+3 −0',
    ]);
    const latestChanges = within(versions).getByRole('group', { name: 'Changes in version 2' });
    expect(within(latestChanges).getByText('Renamed from “Default prompt” to “Timesheet”')).toBeTruthy();
    expect(diffLinesOf(latestChanges)).toEqual([
      ' List my work by project.',
      '−Use one line per task.',
      ' Keep it short.',
    ]);

    await user.click(toggles[1] as HTMLElement);
    await user.click(within(versions).getByRole('button', { name: /^Restore this version/ }));

    expect(nameInput().value).toBe('Default prompt');
    expect(promptValue()).toBe(TIMESHEET_TEXT);
    expect(document.activeElement).toBe(promptField());
    expect(within(dialog).getByText('Unsaved changes · Save adds version 3')).toBeTruthy();
    await user.keyboard('{Meta>}s{/Meta}');

    const restored = fake.agentPrompts().prompts.find((prompt) => prompt.id === 'timesheet');
    expect(restored?.versions.map((version) => [version.number, version.name, version.text])).toEqual([
      [1, 'Default prompt', TIMESHEET_TEXT],
      [2, 'Timesheet', 'List my work by project.\nKeep it short.'],
      [3, 'Default prompt', TIMESHEET_TEXT],
    ]);
    expect(within(dialog).queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });

  it('starts a new prompt with ⌘N, refuses a name that is taken, and saves it as version 1', async () => {
    const { user, fake, dialog } = await openDialog();
    await user.keyboard('{Meta>}n{/Meta}');
    expect(nameInput().value).toBe('New prompt');
    expect(document.activeElement).toBe(nameInput());
    expect(sidebarButton(/^New prompt, not saved yet$/).getAttribute('aria-current')).toBe('true');

    await user.clear(nameInput());
    await user.type(nameInput(), 'standup');
    await user.type(promptField(), 'What did I finish this week?');
    await user.click(dialogButton(/^Save/));
    expect(within(dialog).getByRole('alert').textContent).toBe("There's already a prompt called “Standup”.");
    expect(fake.api.createAgentPrompt).not.toHaveBeenCalled();

    await user.clear(nameInput());
    await user.type(nameInput(), 'Weekly');
    await user.click(dialogButton(/^Save/));

    expect(fake.api.createAgentPrompt).toHaveBeenCalledWith({ name: 'Weekly', text: 'What did I finish this week?' });
    expect(sidebarButton(/^Weekly/).getAttribute('aria-current')).toBe('true');
    expect(sidebarButton(/^Weekly, version 1$/).textContent).toContain('v1');
  });

  it('only opens the agent with a new prompt once it is saved', async () => {
    const { user, fake } = await openDialog();
    await user.keyboard('{Meta>}n{/Meta}');
    await user.click(dialogButton(/^Open agent/));
    const ask = screen.getByRole('alertdialog', { name: 'Save “New prompt”?' });
    expect(within(ask).queryByRole('button', { name: /^Don't save/ })).toBeNull();
    await user.click(within(ask).getByRole('button', { name: /^Save/ }));
    expect(fake.api.createAgentPrompt).toHaveBeenCalledWith({ name: 'New prompt', text: '' });
    expect(fake.api.openAgent).toHaveBeenCalledWith('prompt-1');
  });

  it('deletes a prompt after asking, and shows the next one, but never the last prompt', async () => {
    const { user, fake } = await openDialog();
    expect(dialogButton(/^Delete/).getAttribute('aria-keyshortcuts')).toBe('Shift+Meta+Backspace');
    await user.click(dialogButton(/^Delete/));
    const confirm = screen.getByRole('alertdialog', { name: 'Delete “Default prompt”?' });
    expect(within(confirm).getByText("The prompt and its version will be deleted. This can't be undone.")).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: /^Delete/ }));

    expect(fake.api.deleteAgentPrompt).toHaveBeenCalledWith('timesheet');
    expect(promptValue()).toBe('Summarise yesterday.');
    expect(latestVersion(fake.agentPrompts().prompts[0]!).name).toBe('Standup');
    expect(dialogButton(/^Delete/).disabled).toBe(true);
    expect(dialogButton(/^Delete/).title).toBe('Keep at least one prompt, so the agent has one to start with.');
  });
});
