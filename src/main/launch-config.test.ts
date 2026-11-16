import { describe, expect, it } from 'vitest';
import { LaunchConfigError, readLaunchConfig } from './launch-config';

const DEFAULTS = {
  userDataPath: undefined,
  boardPath: undefined,
  fakeNow: undefined,
  notifierLogPath: undefined,
  notifierFails: false,
  trashDirectory: undefined,
  loginItemDisabled: false,
};

describe('readLaunchConfig', () => {
  it('falls back to normal behaviour when nothing is set', () => {
    expect(readLaunchConfig({})).toEqual(DEFAULTS);
  });

  it('treats blank values as unset', () => {
    expect(readLaunchConfig({ MBOARD_USER_DATA: '   ', MBOARD_FAKE_NOW: ' ' })).toEqual(DEFAULTS);
  });

  it('uses absolute paths, normalised', () => {
    const config = readLaunchConfig({
      MBOARD_USER_DATA: '/tmp/mboard//user-data/',
      MBOARD_BOARD_PATH: '/tmp/vault/board',
      MBOARD_NOTIFIER_LOG: '/tmp/notifications.jsonl',
      MBOARD_TRASH_DIR: '/tmp/trash',
    });
    expect(config.userDataPath).toBe('/tmp/mboard/user-data/');
    expect(config.boardPath).toBe('/tmp/vault/board');
    expect(config.notifierLogPath).toBe('/tmp/notifications.jsonl');
    expect(config.trashDirectory).toBe('/tmp/trash');
  });

  it('rejects relative paths', () => {
    expect(() => readLaunchConfig({ MBOARD_USER_DATA: 'relative/user-data' })).toThrow(LaunchConfigError);
    expect(() => readLaunchConfig({ MBOARD_BOARD_PATH: 'board' })).toThrow(
      'MBOARD_BOARD_PATH must be an absolute path',
    );
  });

  it('reads flags only when set to 1', () => {
    expect(readLaunchConfig({ MBOARD_NOTIFIER_FAIL: '1', MBOARD_DISABLE_LOGIN_ITEM: '1' })).toMatchObject({
      notifierFails: true,
      loginItemDisabled: true,
    });
    expect(readLaunchConfig({ MBOARD_NOTIFIER_FAIL: 'yes' }).notifierFails).toBe(false);
  });

  it('reads MBOARD_FAKE_NOW as local time', () => {
    const fakeNow = readLaunchConfig({ MBOARD_FAKE_NOW: '2026-11-16T09:00:00' }).fakeNow;
    expect(fakeNow?.getFullYear()).toBe(2026);
    expect(fakeNow?.getMonth()).toBe(10);
    expect(fakeNow?.getDate()).toBe(16);
    expect(fakeNow?.getHours()).toBe(9);
  });

  it('rejects a malformed MBOARD_FAKE_NOW', () => {
    expect(() => readLaunchConfig({ MBOARD_FAKE_NOW: '2026-11-16 09:00' })).toThrow(
      'MBOARD_FAKE_NOW must be a local YYYY-MM-DDTHH:mm:ss',
    );
  });
});
