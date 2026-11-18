import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { buildTask } from '../testing/builders';
import { useDomEnvironment } from '../testing/dom-environment';
import { createFakeMboard, type FakeMboardOptions } from '../testing/fake-mboard';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

function settingsDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Settings' });
}

function section(name: string): HTMLElement {
  return within(settingsDialog()).getByRole('region', { name });
}

type SettingsTabName = 'General' | 'Board' | 'Agent' | 'Updates';

async function showTab(user: Awaited<ReturnType<typeof renderBoard>>['user'], name: SettingsTabName): Promise<void> {
  await user.click(within(settingsDialog()).getByRole('tab', { name }));
}

async function openFromGear(options: FakeMboardOptions = {}, tab: SettingsTabName = 'General') {
  const rendered = await renderBoard(options);
  await rendered.user.click(screen.getByRole('button', { name: 'Settings' }));
  await screen.findByRole('dialog', { name: 'Settings' });
  if (tab !== 'General') await showTab(rendered.user, tab);
  return rendered;
}

describe('Opening Settings', () => {
  it('opens from the gear in the header, which mentions Cmd+,', async () => {
    await renderBoard();
    const gear = screen.getByRole('button', { name: 'Settings' });
    expect(gear.getAttribute('title')).toBe('Settings (⌘,)');
    await userEvent.click(gear);
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeTruthy();
  });

  it('opens when the menu asks, by taking the request', async () => {
    const { fake } = await renderBoard();
    act(() => fake.requestSettings());
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(fake.api.takeOpenSettingsRequest).toHaveBeenCalledTimes(2);
  });

  it('opens on launch when the menu asked before the window was listening', async () => {
    createFakeMboard({ pendingSettingsRequest: true }).install();
    render(<App />);
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeTruthy();
  });

  it('opens from the menu on the setup screen too', async () => {
    const fake = createFakeMboard({ appState: { kind: 'needsSetup' } });
    fake.install();
    render(<App />);
    await screen.findByRole('heading', { name: 'Choose your board folder' });
    act(() => fake.requestSettings());
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeTruthy();
    expect(within(section('Board folder')).getByText('Not chosen')).toBeTruthy();
  });

  it('closes with Done and with Esc', async () => {
    const { user } = await openFromGear();
    await user.click(within(settingsDialog()).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });

  it('turns off the board shortcuts while open, and closes with ⌘.', async () => {
    const { user } = await openFromGear({
      tasks: [buildTask({ title: 'Existing' })],
    });
    await user.keyboard('{Meta>}n{/Meta}');
    expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull();
    await user.keyboard('{Meta>}[Period]{/Meta}');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    await user.keyboard('{Meta>}n{/Meta}');
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy();
  });
});

describe('Settings sections', () => {
  it('shows the board folder, open at login, notifications and the running version', async () => {
    const { user } = await openFromGear({
      preferences: { openAtLogin: true, notificationsAvailable: false },
      appUpdateStatus: { currentVersion: '0.1.0', stage: { kind: 'idle' } },
    });
    expect(within(section('Board folder')).getByText('/vault/Board')).toBeTruthy();
    const openAtLogin = within(section('Startup')).getByRole('checkbox') as HTMLInputElement;
    expect(openAtLogin.checked).toBe(true);
    expect(within(section('Notifications')).getByText(/System Settings › Notifications/)).toBeTruthy();
    await showTab(user, 'Updates');
    expect(within(section('App updates')).getByText('mboard 0.1.0')).toBeTruthy();
    expect(within(section('App updates')).getByRole('status').textContent).toBe(
      "mboard hasn't checked for a new version yet.",
    );
  });

  it('turns open at login off and on', async () => {
    const { user, fake } = await openFromGear();
    const checkbox = within(section('Startup')).getByRole('checkbox') as HTMLInputElement;
    await user.click(checkbox);
    expect(fake.api.setOpenAtLogin).toHaveBeenLastCalledWith(false);
    expect(checkbox.checked).toBe(false);
    await user.click(checkbox);
    expect(fake.api.setOpenAtLogin).toHaveBeenLastCalledWith(true);
    expect(checkbox.checked).toBe(true);
  });

  it('keeps the checkbox as it was when the change fails', async () => {
    const { user, fake } = await openFromGear();
    fake.api.setOpenAtLogin.mockRejectedValueOnce(new Error("mboard couldn't change the login item."));
    const checkbox = within(section('Startup')).getByRole('checkbox') as HTMLInputElement;
    await user.click(checkbox);
    expect(await screen.findByText("mboard couldn't change the login item.")).toBeTruthy();
    expect(checkbox.checked).toBe(true);
  });

  it('changes the board folder and shows the new board', async () => {
    const { user, fake } = await openFromGear();
    fake.api.chooseBoardFolder.mockResolvedValue({
      kind: 'accepted',
      state: { kind: 'ready', boardPath: '/vault/Work', boardName: 'Work' },
    });
    await user.click(
      within(section('Board folder')).getByRole('button', {
        name: 'Change folder…',
      }),
    );
    expect(await within(section('Board folder')).findByText('/vault/Work')).toBeTruthy();
    await user.click(within(settingsDialog()).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('heading', { name: 'Work' })).toBeTruthy();
  });

  it('shows a rejected folder inline and keeps the current one', async () => {
    const { user, fake } = await openFromGear();
    fake.api.chooseBoardFolder.mockResolvedValue({
      kind: 'rejected',
      path: '/vault/Full',
      message: "This folder isn't empty and isn't an mboard board.",
    });
    await user.click(
      within(section('Board folder')).getByRole('button', {
        name: 'Change folder…',
      }),
    );
    expect((await within(section('Board folder')).findByRole('alert')).textContent).toBe(
      "This folder isn't empty and isn't an mboard board.",
    );
    expect(within(section('Board folder')).getByText('/vault/Board')).toBeTruthy();
  });
});

describe('Checking for updates in Settings', () => {
  function updatesStatus(): string {
    return within(section('App updates')).getByRole('status').textContent ?? '';
  }

  it('disables the button while checking, then says it is up to date', async () => {
    const { user, fake } = await openFromGear({}, 'Updates');
    const check = within(section('App updates')).getByRole('button', {
      name: 'Check for updates',
    }) as HTMLButtonElement;
    fake.api.checkForAppUpdate.mockImplementationOnce(async () => {
      fake.pushAppUpdateStage({ kind: 'checking' });
      return { currentVersion: '0.1.0', stage: { kind: 'checking' } };
    });
    await user.click(check);
    expect(updatesStatus()).toBe('Checking for a new version…');
    expect(check.disabled).toBe(true);
    act(() =>
      fake.pushAppUpdateStage({
        kind: 'upToDate',
        checkedAt: '2026-11-20T09:30:00',
      }),
    );
    expect(updatesStatus()).toBe('mboard is up to date. Last checked 20 Nov 2026, 09:30.');
    expect(check.disabled).toBe(false);
  });

  it('shows how much of the new version has downloaded', async () => {
    const { fake } = await openFromGear({}, 'Updates');
    act(() => fake.pushAppUpdateStage({ kind: 'downloading', version: '0.2.0', percent: 7 }));
    const bar = within(section('App updates')).getByRole('progressbar', {
      name: 'Download progress',
    }) as HTMLProgressElement;
    expect(bar.value).toBe(7);
    expect(within(section('App updates')).getByText('7%')).toBeTruthy();
    expect(updatesStatus()).toBe('Downloading mboard 0.2.0…');
  });

  it('shows why a check failed', async () => {
    const { fake } = await openFromGear({}, 'Updates');
    act(() =>
      fake.pushAppUpdateStage({
        kind: 'failed',
        message: 'GitHub is limiting update checks right now. Try again later.',
        version: null,
      }),
    );
    expect(updatesStatus()).toBe('GitHub is limiting update checks right now. Try again later.');
    expect(
      within(section('App updates')).queryByRole('button', {
        name: 'Download from GitHub',
      }),
    ).toBeNull();
  });

  it('installs an available version, and links its release notes', async () => {
    const { user, fake } = await openFromGear(
      {
        appUpdateStatus: {
          currentVersion: '0.1.0',
          stage: { kind: 'available', version: '0.2.0', installBlocker: null },
        },
      },
      'Updates',
    );
    expect(updatesStatus()).toBe('mboard 0.2.0 is available.');
    await user.click(
      within(section('App updates')).getByRole('button', {
        name: 'Release notes',
      }),
    );
    expect(fake.api.openAppUpdateReleasePage).toHaveBeenCalledOnce();
    await user.click(
      within(section('App updates')).getByRole('button', {
        name: 'Install and restart',
      }),
    );
    expect(fake.api.installAppUpdate).toHaveBeenCalledOnce();
    expect(updatesStatus()).toBe('Downloading mboard 0.2.0…');
    expect(
      (
        within(section('App updates')).getByRole('button', {
          name: 'Check for updates',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('offers the download page when this copy cannot install, with the reason', async () => {
    const { user, fake } = await openFromGear(
      {
        appUpdateStatus: {
          currentVersion: '0.1.0',
          stage: {
            kind: 'available',
            version: '0.2.0',
            installBlocker: "mboard is running from source, so it can't install new versions itself.",
          },
        },
      },
      'Updates',
    );
    expect(within(section('App updates')).getByText(/running from source/)).toBeTruthy();
    expect(
      within(section('App updates')).queryByRole('button', {
        name: 'Install and restart',
      }),
    ).toBeNull();
    await user.click(
      within(section('App updates')).getByRole('button', {
        name: 'Download from GitHub',
      }),
    );
    expect(fake.api.openAppUpdateReleasePage).toHaveBeenCalledOnce();
  });
});

describe('Settings age colours', () => {
  function days(label: string): HTMLInputElement {
    return within(section('Age colours')).getByLabelText(label) as HTMLInputElement;
  }

  it('lists every colour with the working days it starts from', async () => {
    await openFromGear({}, 'Board');
    const legend = section('Age colours');
    expect(within(legend).getByText('On track')).toBeTruthy();
    expect(within(legend).getByText('0–1 working days')).toBeTruthy();
    expect(days('Needs a nudge from').value).toBe('2');
    expect(days('Stalling from').value).toBe('4');
    expect(days('Stale from').value).toBe('6');
    expect(within(legend).getByText('Tasks in Done and archived tasks are always grey.')).toBeTruthy();
    expect((within(legend).getByRole('button', { name: 'Reset to defaults' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('saves a threshold when its field is left, and recolours the board', async () => {
    const { user, fake } = await openFromGear(
      {
        tasks: [buildTask({ title: 'Two days', updated: '2026-11-12T09:00:00' })],
      },
      'Board',
    );
    expect(screen.getByRole('article', { name: 'Two days', hidden: true }).getAttribute('data-staleness')).toBe(
      'amber',
    );
    await user.clear(days('Needs a nudge from'));
    await user.type(days('Needs a nudge from'), '3');
    await user.tab();
    expect(fake.api.setAgeThresholds).toHaveBeenCalledWith({ nudgeFrom: 3, stallingFrom: 4, staleFrom: 6 });
    expect(within(section('Age colours')).getByText('0–2 working days')).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Two days', hidden: true }).getAttribute('data-staleness')).toBe(
      'green',
    );
  });

  it('saves on Enter too', async () => {
    const { user, fake } = await openFromGear({}, 'Board');
    await user.clear(days('Stale from'));
    await user.type(days('Stale from'), '10{Enter}');
    expect(fake.api.setAgeThresholds).toHaveBeenCalledWith({ nudgeFrom: 2, stallingFrom: 4, staleFrom: 10 });
  });

  it('explains thresholds out of order or out of range and saves nothing', async () => {
    const { user, fake } = await openFromGear({}, 'Board');
    await user.clear(days('Stalling from'));
    await user.type(days('Stalling from'), '7');
    await user.tab();
    expect(within(section('Age colours')).getByRole('alert').textContent).toBe(
      'Needs a nudge must start before Stalling, and Stalling before Stale.',
    );
    await user.clear(days('Stalling from'));
    await user.tab();
    expect(within(section('Age colours')).getByRole('alert').textContent).toBe(
      'Each age colour starts at a whole number of working days from 1 to 99.',
    );
    expect(fake.api.setAgeThresholds).not.toHaveBeenCalled();
  });

  it('resets to the defaults', async () => {
    const { user, fake } = await openFromGear(
      { ageThresholds: { nudgeFrom: 3, stallingFrom: 5, staleFrom: 10 } },
      'Board',
    );
    expect(days('Stale from').value).toBe('10');
    await user.click(within(section('Age colours')).getByRole('button', { name: 'Reset to defaults' }));
    expect(fake.api.setAgeThresholds).toHaveBeenCalledWith({ nudgeFrom: 2, stallingFrom: 4, staleFrom: 6 });
    expect(days('Stale from').value).toBe('6');
  });
});

describe('Settings agent', () => {
  function agentField<T extends HTMLElement>(label: string): T {
    return within(section('Agent')).getByLabelText(label) as T;
  }

  it('shows the terminal, the agent command and the prompt', async () => {
    await openFromGear(
      {
        agentSettings: {
          terminal: 'Ghostty',
          command: 'claude-personal',
          prompt: 'List my work.',
          columns: ['In progress', 'Done'],
        },
      },
      'Agent',
    );
    expect((await within(section('Agent')).findByLabelText<HTMLSelectElement>('Terminal')).value).toBe('Ghostty');
    expect(agentField<HTMLInputElement>('Agent command').value).toBe('claude-personal');
    expect((within(section('Prompt')).getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('List my work.');
    const ticked = within(section('Prompt'))
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => box.parentElement?.textContent);
    expect(ticked).toEqual(['In progress', 'Done']);
    expect(agentField('Terminal').getAttribute('aria-keyshortcuts')).toBe('Meta+T');
  });

  it('saves the terminal as soon as it is picked, and switches it with ⌘T', async () => {
    const { user, fake } = await openFromGear({}, 'Agent');
    await user.selectOptions(await within(section('Agent')).findByLabelText('Terminal'), 'Terminal');
    expect(fake.api.setAgentSettings).toHaveBeenLastCalledWith(expect.objectContaining({ terminal: 'Terminal' }));
    await user.keyboard('{Meta>}t{/Meta}');
    expect(fake.api.setAgentSettings).toHaveBeenLastCalledWith(expect.objectContaining({ terminal: 'Ghostty' }));
    expect(agentField<HTMLSelectElement>('Terminal').value).toBe('Ghostty');
  });

  it('saves the command on Enter and the prompt when its field is left, trimmed', async () => {
    const { user, fake } = await openFromGear({}, 'Agent');
    const command = await within(section('Agent')).findByLabelText('Agent command');
    await user.clear(command);
    await user.type(command, '  claude-april9 {Enter}');
    expect(fake.api.setAgentSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: '  claude-april9 ' }),
    );
    expect(agentField<HTMLInputElement>('Agent command').value).toBe('claude-april9');

    const prompt = within(section('Prompt')).getByLabelText('Prompt');
    await user.clear(prompt);
    await user.type(prompt, 'Summarise my week.');
    await user.tab();
    expect(fake.api.setAgentSettings).toHaveBeenLastCalledWith({
      terminal: 'Ghostty',
      command: 'claude-april9',
      prompt: 'Summarise my week.',
      columns: ['Done'],
    });
  });

  it('explains a command that cannot be saved, and saves nothing', async () => {
    const { user, fake } = await openFromGear({}, 'Agent');
    await user.clear(await within(section('Agent')).findByLabelText('Agent command'));
    await user.tab();
    expect(within(section('Agent')).getByRole('alert').textContent).toBe(
      'Enter the command that starts your agent, for example claude.',
    );
    expect(fake.api.setAgentSettings).not.toHaveBeenCalled();
  });

  it('saves a prompt still being typed when Settings closes with Esc', async () => {
    const { user, fake } = await openFromGear({}, 'Agent');
    const prompt = await within(section('Prompt')).findByLabelText('Prompt');
    await user.clear(prompt);
    await user.type(prompt, 'Draft prompt');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(fake.api.setAgentSettings).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: 'Draft prompt' }));
  });
});

describe('Settings tabs', () => {
  it('opens on General, and shows each tab from the tab bar, with ⌥⌘1 to ⌥⌘4 and with the arrow keys', async () => {
    const { user } = await openFromGear();
    const tab = (name: string) => within(settingsDialog()).getByRole('tab', { name });
    expect(tab('General').getAttribute('aria-selected')).toBe('true');
    expect(within(settingsDialog()).queryByRole('region', { name: 'App updates' })).toBeNull();
    expect(tab('Updates').getAttribute('aria-keyshortcuts')).toBe('Alt+Meta+4');

    await user.keyboard('{Meta>}{Alt>}4{/Alt}{/Meta}');
    expect(tab('Updates').getAttribute('aria-selected')).toBe('true');
    expect(section('App updates')).toBeTruthy();

    tab('Updates').focus();
    await user.keyboard('{ArrowLeft}');
    expect(tab('Agent').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Agent'));
    await user.keyboard('{Home}');
    expect(tab('General').getAttribute('aria-selected')).toBe('true');

    await user.click(tab('Board'));
    expect(section('Age colours')).toBeTruthy();
    expect(within(settingsDialog()).queryByRole('region', { name: 'Board folder' })).toBeNull();
  });

  it('keeps the shortcuts of a hidden tab working, such as ⌘U on General', async () => {
    const { user, fake } = await openFromGear();
    await user.keyboard('{Meta>}u{/Meta}');
    expect(fake.api.checkForAppUpdate).toHaveBeenCalledOnce();
  });
});

describe('Settings agent columns', () => {
  function columnBox(name: string): HTMLInputElement {
    return within(within(section('Prompt')).getByRole('group', { name: 'Agent column options' })).getByLabelText(
      name,
    ) as HTMLInputElement;
  }

  it('saves a column as soon as it is ticked or unticked, and keeps the last one ticked', async () => {
    const { user, fake } = await openFromGear({}, 'Agent');
    await within(section('Prompt')).findByLabelText('Prompt');
    expect(columnBox('Done').checked).toBe(true);
    expect(columnBox('Done').disabled).toBe(true);

    await user.click(columnBox('In progress'));
    expect(fake.api.setAgentSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ columns: ['In progress', 'Done'] }),
    );
    expect(columnBox('Done').disabled).toBe(false);

    await user.click(columnBox('Done'));
    expect(fake.api.setAgentSettings).toHaveBeenLastCalledWith(expect.objectContaining({ columns: ['In progress'] }));
    expect(columnBox('In progress').disabled).toBe(true);
  });

  it('turns Open agent on for the columns chosen, even with nothing in Done', async () => {
    const { user } = await openFromGear({ tasks: [buildTask({ title: 'Doing', status: 'In progress' })] }, 'Agent');
    const openAgent = () => screen.getByRole('button', { name: 'Open agent', hidden: true }) as HTMLButtonElement;
    expect(openAgent().disabled).toBe(true);
    await within(section('Prompt')).findByLabelText('Prompt');
    await user.click(columnBox('In progress'));
    expect(openAgent().disabled).toBe(false);
    expect(openAgent().title).toBe('Open your agent in a terminal with the tasks in In progress and Done');
  });
});
