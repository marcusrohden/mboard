import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { useDomEnvironment } from '../testing/dom-environment';
import { createFakeMboard } from '../testing/fake-mboard';
import { renderBoard } from '../testing/render-board';

useDomEnvironment();

const NOTICE = { name: 'New version of mboard' };

function notice(): HTMLElement {
  return screen.getByRole('region', NOTICE);
}

describe('New version notice', () => {
  it.each([
    ['idle', { kind: 'idle' as const }],
    ['checking', { kind: 'checking' as const }],
    [
      'up to date',
      { kind: 'upToDate' as const, checkedAt: '2026-11-20T09:30:00' },
    ],
    [
      'a failed check',
      { kind: 'failed' as const, message: 'Offline.', version: null },
    ],
  ])('is absent when %s', async (_description, stage) => {
    await renderBoard({ appUpdateStatus: { currentVersion: '0.1.0', stage } });
    expect(screen.queryByRole('region', NOTICE)).toBeNull();
  });

  it('appears when main finds a new version, and installs it', async () => {
    const { user, fake } = await renderBoard();
    act(() =>
      fake.pushAppUpdateStage({
        kind: 'available',
        version: '0.2.0',
        installBlocker: null,
      }),
    );
    expect(within(notice()).getByRole('status').textContent).toBe(
      'mboard 0.2.0 is available.',
    );
    await user.click(
      within(notice()).getByRole('button', { name: 'Install and restart' }),
    );
    expect(fake.api.installAppUpdate).toHaveBeenCalledOnce();
    expect(within(notice()).getByRole('status').textContent).toBe(
      'Downloading mboard 0.2.0…',
    );
  });

  it('opens the release notes', async () => {
    const { user, fake } = await renderBoard({
      appUpdateStatus: {
        currentVersion: '0.1.0',
        stage: { kind: 'available', version: '0.2.0', installBlocker: null },
      },
    });
    await user.click(
      within(notice()).getByRole('button', { name: 'Release notes' }),
    );
    expect(fake.api.openAppUpdateReleasePage).toHaveBeenCalledOnce();
  });

  it('offers the download page instead when this copy cannot install', async () => {
    const { user, fake } = await renderBoard({
      appUpdateStatus: {
        currentVersion: '0.1.0',
        stage: {
          kind: 'available',
          version: '0.2.0',
          installBlocker: 'macOS is running mboard from a temporary copy.',
        },
      },
    });
    expect(
      within(notice()).queryByRole('button', { name: 'Install and restart' }),
    ).toBeNull();
    await user.click(
      within(notice()).getByRole('button', { name: 'Download from GitHub' }),
    );
    expect(fake.api.openAppUpdateReleasePage).toHaveBeenCalledOnce();
  });

  it('hides with Later for that version, and comes back for a newer one', async () => {
    const { user, fake } = await renderBoard({
      appUpdateStatus: {
        currentVersion: '0.1.0',
        stage: { kind: 'available', version: '0.2.0', installBlocker: null },
      },
    });
    await user.click(within(notice()).getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('region', NOTICE)).toBeNull();
    act(() =>
      fake.pushAppUpdateStage({
        kind: 'available',
        version: '0.2.0',
        installBlocker: null,
      }),
    );
    expect(screen.queryByRole('region', NOTICE)).toBeNull();
    act(() =>
      fake.pushAppUpdateStage({
        kind: 'available',
        version: '0.3.0',
        installBlocker: null,
      }),
    );
    expect(within(notice()).getByRole('status').textContent).toBe(
      'mboard 0.3.0 is available.',
    );
  });

  it('shows a failed install with the download page', async () => {
    const { user, fake } = await renderBoard();
    act(() =>
      fake.pushAppUpdateStage({
        kind: 'failed',
        message:
          "The downloaded file didn't match the release, so mboard didn't install it.",
        version: '0.2.0',
      }),
    );
    expect(within(notice()).getByRole('status').textContent).toBe(
      "The downloaded file didn't match the release, so mboard didn't install it.",
    );
    await user.click(
      within(notice()).getByRole('button', { name: 'Download from GitHub' }),
    );
    expect(fake.api.openAppUpdateReleasePage).toHaveBeenCalledOnce();
  });

  it('shows on the setup screen too', async () => {
    const fake = createFakeMboard({
      appState: { kind: 'needsSetup' },
      appUpdateStatus: {
        currentVersion: '0.1.0',
        stage: { kind: 'available', version: '0.2.0', installBlocker: null },
      },
    });
    fake.install();
    render(<App />);
    expect(await screen.findByRole('region', NOTICE)).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Choose your board folder' }),
    ).toBeTruthy();
  });
});
