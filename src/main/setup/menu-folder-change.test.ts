import { describe, expect, it, vi } from 'vitest';
import type { FolderChoice } from '../../shared/contract';
import type { BoardSetupService } from '../ports';
import { MenuFolderChange, type FolderChangeDialogs } from './menu-folder-change';

const ACCEPTED: FolderChoice = { kind: 'accepted', state: { kind: 'ready', boardPath: '/B', boardName: 'B' } };

function harness(options: { picked?: string | null; choice: FolderChoice; confirmed?: FolderChoice; useAnyway?: boolean }) {
  const setup = {
    getAppState: vi.fn(),
    retry: vi.fn(),
    choose: vi.fn(async () => options.choice),
    confirm: vi.fn(async () => options.confirmed ?? ACCEPTED),
  };
  const dialogs: FolderChangeDialogs = {
    pickBoardFolder: vi.fn(async () => (options.picked === undefined ? '/B' : options.picked)),
    showRejection: vi.fn(async () => undefined),
    confirmOutsideVault: vi.fn(async () => options.useAnyway ?? false),
    showError: vi.fn(async () => undefined),
  };
  const showWindow = vi.fn(async () => undefined);
  const change = new MenuFolderChange(setup as unknown as BoardSetupService, dialogs, showWindow);
  return { change, setup, dialogs, showWindow };
}

describe('MenuFolderChange', () => {
  it('shows the window and stops quietly when the picker is cancelled', async () => {
    const { change, setup, showWindow } = harness({ picked: null, choice: ACCEPTED });
    await change.run();

    expect(showWindow).toHaveBeenCalled();
    expect(setup.choose).not.toHaveBeenCalled();
  });

  it('shows a rejection in a native message box', async () => {
    const { change, dialogs } = harness({ choice: { kind: 'rejected', path: '/B', message: "Not a board." } });
    await change.run();

    expect(dialogs.showRejection).toHaveBeenCalledWith('Not a board.');
  });

  it('confirms the vault warning with Use anyway', async () => {
    const { change, setup } = harness({
      choice: { kind: 'needsConfirmation', path: '/B', message: 'Use it anyway?' },
      useAnyway: true,
    });
    await change.run();

    expect(setup.confirm).toHaveBeenCalledWith('/B');
  });

  it('does nothing more when the vault warning is cancelled', async () => {
    const { change, setup } = harness({ choice: { kind: 'needsConfirmation', path: '/B', message: 'Use it anyway?' } });
    await change.run();

    expect(setup.confirm).not.toHaveBeenCalled();
  });

  it('shows an unexpected failure as an error box', async () => {
    const { change, setup, dialogs } = harness({ choice: ACCEPTED });
    setup.choose.mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));
    await change.run();

    expect(dialogs.showError).toHaveBeenCalledWith("mboard doesn't have permission to change files in the board folder.");
  });

  it('ignores a second request while one is open', async () => {
    const { change, dialogs } = harness({ choice: ACCEPTED });
    await Promise.all([change.run(), change.run()]);

    expect(dialogs.pickBoardFolder).toHaveBeenCalledTimes(1);
  });
});
