import type { AgentTerminal } from '../../domain';

/** Runs a command without a shell. Rejects when it can't start or exits with a failure. */
export type RunCommand = (command: string, args: readonly string[]) => Promise<unknown>;

/** Opens a script in a terminal, which runs it in a new window. */
export type OpenInTerminal = (terminal: AgentTerminal, scriptPath: string) => Promise<void>;

/** Each terminal's bundle identifier, so it is found wherever it is installed. */
export const TERMINAL_BUNDLE_IDS: Readonly<Record<AgentTerminal, string>> = Object.freeze({
  Ghostty: 'com.mitchellh.ghostty',
  Terminal: 'com.apple.Terminal',
});

const OPEN_COMMAND = '/usr/bin/open';

/**
 * The `open` arguments that run a script in each terminal, all through Launch Services, so no Automation
 * permission is needed.
 *
 * - **Ghostty** asks "Allow Ghostty to execute …?" for a script it is handed as a file, so it is started as
 *   a new instance whose first window runs the script (`-e`). That instance quits when its window closes,
 *   and neither restores nor saves windows, so it leaves the person's own Ghostty windows alone.
 * - **Terminal** runs a `.command` file it is handed in a new window.
 */
export function terminalOpenArguments(terminal: AgentTerminal, scriptPath: string): string[] {
  const bundleId = TERMINAL_BUNDLE_IDS[terminal];
  switch (terminal) {
    case 'Ghostty':
      return [
        '-n',
        '-b',
        bundleId,
        '--args',
        '--quit-after-last-window-closed=true',
        '--window-save-state=never',
        '-e',
        '/bin/sh',
        scriptPath,
      ];
    case 'Terminal':
      return ['-b', bundleId, scriptPath];
  }
}

/** Opens scripts in the chosen terminal with `open`, and puts a failure into plain words. */
export function createTerminalOpener(runCommand: RunCommand): OpenInTerminal {
  return async (terminal, scriptPath) => {
    try {
      await runCommand(OPEN_COMMAND, terminalOpenArguments(terminal, scriptPath));
    } catch (error) {
      console.error(`mboard could not open ${terminal}:`, error);
      throw new Error(
        `mboard couldn't open ${terminal}. Check that it's installed, or choose another terminal in Settings.`,
      );
    }
  };
}
