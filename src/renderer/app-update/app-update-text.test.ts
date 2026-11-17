import { describe, expect, it } from 'vitest';
import type { AppUpdateStage } from '../../shared/contract';
import { appUpdateStageText, canInstallItself, isAppUpdateBusy, stageVersion } from './app-update-text';

const STAGES: Array<[AppUpdateStage, string, boolean, string | null]> = [
  [{ kind: 'idle' }, "mboard hasn't checked for a new version yet.", false, null],
  [{ kind: 'checking' }, 'Checking for a new version…', true, null],
  [
    { kind: 'upToDate', checkedAt: '2026-11-20T09:30:00' },
    'mboard is up to date. Last checked 20 Nov 2026, 09:30.',
    false,
    null,
  ],
  [{ kind: 'available', version: '0.2.0', installBlocker: null }, 'mboard 0.2.0 is available.', false, '0.2.0'],
  [{ kind: 'downloading', version: '0.2.0' }, 'Downloading mboard 0.2.0…', true, '0.2.0'],
  [
    { kind: 'installing', version: '0.2.0' },
    'Installing mboard 0.2.0. mboard will restart in a moment.',
    true,
    '0.2.0',
  ],
  [{ kind: 'failed', message: 'Offline.', version: null }, 'Offline.', false, null],
  [{ kind: 'failed', message: 'Bad zip.', version: '0.2.0' }, 'Bad zip.', false, '0.2.0'],
];

describe('app update stage helpers', () => {
  it.each(STAGES)('describe %j', (stage, text, isBusy, version) => {
    expect(appUpdateStageText(stage)).toBe(text);
    expect(isAppUpdateBusy(stage)).toBe(isBusy);
    expect(stageVersion(stage)).toBe(version);
  });

  it('let this copy install only an available version with nothing blocking it', () => {
    expect(
      canInstallItself({
        kind: 'available',
        version: '0.2.0',
        installBlocker: null,
      }),
    ).toBe(true);
    expect(
      canInstallItself({
        kind: 'available',
        version: '0.2.0',
        installBlocker: 'No.',
      }),
    ).toBe(false);
    expect(canInstallItself({ kind: 'downloading', version: '0.2.0' })).toBe(false);
  });
});
