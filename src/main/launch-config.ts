import path from 'node:path';

/**
 * Environment variables that main reads once at startup, before the app is ready. They exist so
 * end-to-end tests never touch real settings, the real vault, the real Trash or real notifications.
 */
export const LaunchEnvVariable = {
  userData: 'MBOARD_USER_DATA',
  boardPath: 'MBOARD_BOARD_PATH',
  fakeNow: 'MBOARD_FAKE_NOW',
  notifierLog: 'MBOARD_NOTIFIER_LOG',
  notifierFail: 'MBOARD_NOTIFIER_FAIL',
  trashDir: 'MBOARD_TRASH_DIR',
  disableLoginItem: 'MBOARD_DISABLE_LOGIN_ITEM',
  disableAppUpdateCheck: 'MBOARD_DISABLE_APP_UPDATE_CHECK',
} as const;

/**
 * Settings derived from the launch environment. Values are `undefined` (or `false`) when the variable
 * is unset, so the app falls back to its normal behaviour.
 */
export interface LaunchConfig {
  readonly userDataPath: string | undefined;
  readonly boardPath: string | undefined;
  readonly fakeNow: Date | undefined;
  readonly notifierLogPath: string | undefined;
  readonly notifierFails: boolean;
  readonly trashDirectory: string | undefined;
  readonly loginItemDisabled: boolean;
  readonly appUpdateCheckDisabled: boolean;
}

type LaunchEnvironment = Readonly<Record<string, string | undefined>>;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/**
 * Raised when a launch environment variable holds a value the app cannot use.
 */
export class LaunchConfigError extends Error {
  constructor(variableName: string, problem: string) {
    super(`${variableName} ${problem}`);
    this.name = 'LaunchConfigError';
  }
}

/**
 * Reads mboard's launch settings from the given environment.
 *
 * @throws {LaunchConfigError} when a path variable is relative or `MBOARD_FAKE_NOW` isn't a local
 * `YYYY-MM-DDTHH:mm:ss`.
 */
export function readLaunchConfig(env: LaunchEnvironment): LaunchConfig {
  return {
    userDataPath: readAbsolutePath(env, LaunchEnvVariable.userData),
    boardPath: readAbsolutePath(env, LaunchEnvVariable.boardPath),
    fakeNow: readLocalDateTime(env, LaunchEnvVariable.fakeNow),
    notifierLogPath: readAbsolutePath(env, LaunchEnvVariable.notifierLog),
    notifierFails: readFlag(env, LaunchEnvVariable.notifierFail),
    trashDirectory: readAbsolutePath(env, LaunchEnvVariable.trashDir),
    loginItemDisabled: readFlag(env, LaunchEnvVariable.disableLoginItem),
    appUpdateCheckDisabled: readFlag(env, LaunchEnvVariable.disableAppUpdateCheck),
  };
}

function readValue(env: LaunchEnvironment, variableName: string): string | undefined {
  const value = env[variableName]?.trim();
  return value ? value : undefined;
}

function readAbsolutePath(env: LaunchEnvironment, variableName: string): string | undefined {
  const value = readValue(env, variableName);
  if (value === undefined) {
    return undefined;
  }
  if (!path.isAbsolute(value)) {
    throw new LaunchConfigError(variableName, `must be an absolute path, but was "${value}".`);
  }
  return path.normalize(value);
}

function readFlag(env: LaunchEnvironment, variableName: string): boolean {
  return readValue(env, variableName) === '1';
}

function readLocalDateTime(env: LaunchEnvironment, variableName: string): Date | undefined {
  const value = readValue(env, variableName);
  if (value === undefined) {
    return undefined;
  }
  const match = LOCAL_DATE_TIME.exec(value);
  if (match === null) {
    throw new LaunchConfigError(variableName, `must be a local YYYY-MM-DDTHH:mm:ss, but was "${value}".`);
  }
  const [year, month, day, hours, minutes, seconds] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return new Date(year, month - 1, day, hours, minutes, seconds);
}
