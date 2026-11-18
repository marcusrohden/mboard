import path from 'node:path';

/** macOS's default shell since Catalina, used when neither source names one. */
export const FALLBACK_LOGIN_SHELL = '/bin/zsh';

/**
 * The person's login shell: `SHELL` from mboard's environment, else the shell in their user record, else
 * zsh. Only an absolute path counts, because the launch script runs it directly.
 */
export function loginShell(environmentShell: string | undefined, userRecordShell: string | null | undefined): string {
  return [environmentShell, userRecordShell].find(isAbsolutePath) ?? FALLBACK_LOGIN_SHELL;
}

function isAbsolutePath(candidate: string | null | undefined): candidate is string {
  return typeof candidate === 'string' && candidate.trim() !== '' && path.isAbsolute(candidate);
}
