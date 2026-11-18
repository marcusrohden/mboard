import { describe, expect, it, vi } from 'vitest';
import { loginShell } from './login-shell';
import { createTerminalOpener } from './terminal-opener';

describe('createTerminalOpener', () => {
  it('starts a new Ghostty that runs the script as its first window, and quits when that window closes', async () => {
    const runCommand = vi.fn(async () => '');

    await createTerminalOpener(runCommand)('Ghostty', '/tmp/mboard-agent-x/open-agent.command');

    expect(runCommand).toHaveBeenCalledWith('/usr/bin/open', [
      '-n',
      '-b',
      'com.mitchellh.ghostty',
      '--args',
      '--quit-after-last-window-closed=true',
      '--window-save-state=never',
      '-e',
      '/bin/sh',
      '/tmp/mboard-agent-x/open-agent.command',
    ]);
  });

  it('hands the script to Terminal by its bundle identifier', async () => {
    const runCommand = vi.fn(async () => '');

    await createTerminalOpener(runCommand)('Terminal', '/tmp/mboard-agent-x/open-agent.command');

    expect(runCommand).toHaveBeenCalledWith('/usr/bin/open', [
      '-b',
      'com.apple.Terminal',
      '/tmp/mboard-agent-x/open-agent.command',
    ]);
  });

  it('says in plain words when the terminal cannot be opened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runCommand = vi.fn(async () => {
      throw new Error('Unable to find application with bundle identifier com.mitchellh.ghostty');
    });

    await expect(createTerminalOpener(runCommand)('Ghostty', '/tmp/script.command')).rejects.toThrow(
      "mboard couldn't open Ghostty. Check that it's installed, or choose another terminal in Settings.",
    );
  });
});

describe('loginShell', () => {
  it('prefers SHELL, then the user record, then zsh, taking only absolute paths', () => {
    expect(loginShell('/opt/homebrew/bin/fish', '/bin/zsh')).toBe('/opt/homebrew/bin/fish');
    expect(loginShell(undefined, '/bin/bash')).toBe('/bin/bash');
    expect(loginShell('fish', null)).toBe('/bin/zsh');
    expect(loginShell('', undefined)).toBe('/bin/zsh');
  });
});
