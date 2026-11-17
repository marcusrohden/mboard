import { describe, expect, it } from 'vitest';
import {
  appBundlePath,
  backupBundlePath,
  bundleLocationProblem,
  isStagingFolder,
  unwritableFolderProblem,
} from './install-location';

const EXECUTABLE = '/Applications/mboard.app/Contents/MacOS/mboard';

describe('appBundlePath', () => {
  it('is three levels above the executable', () => {
    expect(appBundlePath(EXECUTABLE)).toBe('/Applications/mboard.app');
    expect(
      appBundlePath('/Users/me/Apps/mboard copy.app/Contents/MacOS/mboard'),
    ).toBe('/Users/me/Apps/mboard copy.app');
  });
});

describe('backupBundlePath', () => {
  it('is a hidden sibling of the bundle', () => {
    expect(backupBundlePath('/Applications/mboard.app')).toBe(
      '/Applications/.mboard.app.app-update-backup',
    );
  });
});

describe('bundleLocationProblem', () => {
  it('allows a packaged app in a normal folder', () => {
    expect(
      bundleLocationProblem({ isPackaged: true, executablePath: EXECUTABLE }),
    ).toBeNull();
  });

  it('rules out running from source', () => {
    expect(
      bundleLocationProblem({ isPackaged: false, executablePath: EXECUTABLE }),
    ).toMatch(/running from source/);
  });

  it('rules out an executable that is not inside an app bundle', () => {
    expect(
      bundleLocationProblem({
        isPackaged: true,
        executablePath: '/opt/mboard/bin/mboard',
      }),
    ).toMatch(/isn't running from an app bundle/);
  });

  it('rules out a copy that macOS translocated', () => {
    const translocated =
      '/private/var/folders/xy/T/AppTranslocation/1234-ABCD/d/mboard.app/Contents/MacOS/mboard';
    expect(
      bundleLocationProblem({ isPackaged: true, executablePath: translocated }),
    ).toMatch(/temporary copy/);
  });
});

describe('unwritableFolderProblem', () => {
  it('names the folder', () => {
    expect(unwritableFolderProblem('/Applications')).toBe(
      "mboard can't replace itself in /Applications, because it isn't allowed to change that folder.",
    );
  });
});

describe('isStagingFolder', () => {
  it('accepts only prefixed folders directly inside the temp folder', () => {
    expect(
      isStagingFolder('/tmp/T/mboard-app-update-0.2.0-abc123', '/tmp/T'),
    ).toBe(true);
    expect(
      isStagingFolder('/tmp/T/mboard-app-update-0.2.0-abc123', '/tmp/T/'),
    ).toBe(true);
    expect(isStagingFolder('/tmp/T/other-folder', '/tmp/T')).toBe(false);
    expect(
      isStagingFolder('/tmp/T/nested/mboard-app-update-0.2.0', '/tmp/T'),
    ).toBe(false);
    expect(isStagingFolder('/tmp/T', '/tmp/T')).toBe(false);
  });
});
