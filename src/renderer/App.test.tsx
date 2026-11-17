import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { createFakeMboard } from './testing/fake-mboard';
import { useDomEnvironment } from './testing/dom-environment';

useDomEnvironment();

describe('App routing on app state', () => {
  it('shows the setup screen when the board needs setup', async () => {
    createFakeMboard({ appState: { kind: 'needsSetup' } }).install();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Choose your board folder' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeTruthy();
  });

  it('shows the path and the reason when the board folder is unavailable', async () => {
    createFakeMboard({
      appState: { kind: 'unavailable', path: '/vault/Gone', reason: 'notFound' },
    }).install();
    render(<App />);
    expect(await screen.findByRole('heading', { name: "Can't open your board" })).toBeTruthy();
    expect(screen.getByText('/vault/Gone')).toBeTruthy();
    expect(screen.getByText(/doesn't exist any more/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeTruthy();
  });

  it('shows the board when the app state is ready, and follows pushed state changes', async () => {
    const fake = createFakeMboard();
    fake.install();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Board' })).toBeTruthy();
    act(() => fake.pushAppState({ kind: 'needsSetup' }));
    expect(await screen.findByRole('heading', { name: 'Choose your board folder' })).toBeTruthy();
  });

  it('retries opening the board and moves to the state it returns', async () => {
    const fake = createFakeMboard({ appState: { kind: 'unavailable', path: '/vault/Gone', reason: 'notFound' } });
    fake.install();
    fake.api.retryOpenBoard.mockResolvedValue({ kind: 'ready', boardPath: '/vault/Back', boardName: 'Back' });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Back' })).toBeTruthy();
  });
});

describe('Setup screen folder flow', () => {
  it('ignores a cancelled picker', async () => {
    const fake = createFakeMboard({ appState: { kind: 'needsSetup' } });
    fake.install();
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }));
    expect(fake.api.chooseBoardFolder).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Choose your board folder' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a rejection inline', async () => {
    const fake = createFakeMboard({ appState: { kind: 'needsSetup' } });
    fake.install();
    fake.api.chooseBoardFolder.mockResolvedValue({
      kind: 'rejected',
      path: '/vault/Full',
      message: "This folder isn't empty and isn't an mboard board.",
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }));
    expect((await screen.findByRole('alert')).textContent).toBe("This folder isn't empty and isn't an mboard board.");
  });

  it('asks for confirmation outside a vault, then accepts with Use anyway', async () => {
    const fake = createFakeMboard({ appState: { kind: 'needsSetup' } });
    fake.install();
    fake.api.chooseBoardFolder.mockResolvedValue({
      kind: 'needsConfirmation',
      path: '/elsewhere/Board',
      message: "This folder doesn't look like it's inside an Obsidian vault. Use it anyway?",
    });
    fake.api.confirmBoardFolder.mockResolvedValue({
      kind: 'accepted',
      state: { kind: 'ready', boardPath: '/elsewhere/Board', boardName: 'Board' },
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Use it anyway/);
    await userEvent.click(screen.getByRole('button', { name: 'Use anyway' }));
    expect(fake.api.confirmBoardFolder).toHaveBeenCalledWith('/elsewhere/Board');
    expect(await screen.findByRole('heading', { name: 'Board' })).toBeTruthy();
  });

  it('goes back to choosing when the confirmation is cancelled', async () => {
    const fake = createFakeMboard({ appState: { kind: 'needsSetup' } });
    fake.install();
    fake.api.chooseBoardFolder.mockResolvedValue({
      kind: 'needsConfirmation',
      path: '/elsewhere/Board',
      message: 'Use it anyway?',
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Use anyway' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeTruthy();
  });

  it('moves to the accepted state', async () => {
    const fake = createFakeMboard({ appState: { kind: 'needsSetup' } });
    fake.install();
    fake.api.chooseBoardFolder.mockResolvedValue({
      kind: 'accepted',
      state: { kind: 'ready', boardPath: '/vault/New', boardName: 'New' },
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }));
    expect(await screen.findByRole('heading', { name: 'New' })).toBeTruthy();
  });

  it('shows a toast when the picker call fails', async () => {
    const fake = createFakeMboard({ appState: { kind: 'needsSetup' } });
    fake.install();
    fake.api.chooseBoardFolder.mockRejectedValue(new Error('The picker could not open.'));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose folder…' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The picker could not open.');
  });
});
