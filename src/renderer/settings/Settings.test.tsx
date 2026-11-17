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

async function openFromGear(options: FakeMboardOptions = {}) {
  const rendered = await renderBoard(options);
  await rendered.user.click(screen.getByRole('button', { name: 'Settings' }));
  await screen.findByRole('dialog', { name: 'Settings' });
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

  it('turns off the board shortcuts while open', async () => {
    const { user } = await openFromGear({
      tasks: [buildTask({ title: 'Existing' })],
    });
    await user.keyboard('n');
    expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull();
  });
});

describe('Settings sections', () => {
  it('shows the board folder, open at login, notifications and the running version', async () => {
    await openFromGear({
      preferences: { openAtLogin: true, notificationsAvailable: false },
      appUpdateStatus: { currentVersion: '0.1.0', stage: { kind: 'idle' } },
    });
    expect(within(section('Board folder')).getByText('/vault/Board')).toBeTruthy();
    const openAtLogin = within(section('Open at login')).getByRole('checkbox') as HTMLInputElement;
    expect(openAtLogin.checked).toBe(true);
    expect(within(section('Notifications')).getByText(/System Settings › Notifications/)).toBeTruthy();
    expect(within(section('App updates')).getByText('mboard 0.1.0')).toBeTruthy();
    expect(within(section('App updates')).getByRole('status').textContent).toBe(
      "mboard hasn't checked for a new version yet.",
    );
  });

  it('turns open at login off and on', async () => {
    const { user, fake } = await openFromGear();
    const checkbox = within(section('Open at login')).getByRole('checkbox') as HTMLInputElement;
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
    const checkbox = within(section('Open at login')).getByRole('checkbox') as HTMLInputElement;
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
    const { user, fake } = await openFromGear();
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

  it('shows why a check failed', async () => {
    const { fake } = await openFromGear();
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
    const { user, fake } = await openFromGear({
      appUpdateStatus: {
        currentVersion: '0.1.0',
        stage: { kind: 'available', version: '0.2.0', installBlocker: null },
      },
    });
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
    const { user, fake } = await openFromGear({
      appUpdateStatus: {
        currentVersion: '0.1.0',
        stage: {
          kind: 'available',
          version: '0.2.0',
          installBlocker: "mboard is running from source, so it can't install new versions itself.",
        },
      },
    });
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
