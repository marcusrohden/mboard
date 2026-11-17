/** How long the helper waits for mboard to quit before giving up, in seconds. */
export const SWAP_WAIT_LIMIT_SECONDS = 60;

/** The macOS command that opens the app bundle once it has been replaced. */
export const RELAUNCH_COMMAND = '/usr/bin/open';

/** Everything the swap helper needs to replace the running app bundle. */
export interface SwapPlan {
  /** The mboard process to wait for. */
  processId: number;
  currentBundle: string;
  replacementBundle: string;
  backupBundle: string;
  stagingFolder: string;
  /** Run with the bundle path once the swap has finished or been rolled back. */
  relaunchCommand: string;
  waitLimitSeconds: number;
}

/**
 * The helper that swaps the bundles once mboard has quit. It waits for the process to exit (giving up
 * after the wait limit), moves the current bundle aside, moves the new one into its place and removes the
 * backup, or puts the old bundle back if the move fails. Whatever happens it removes the staging folder,
 * then opens whichever bundle is in place, unless mboard never quit.
 */
const SWAP_SCRIPT = `set -u
pid="$1" current="$2" replacement="$3" backup="$4" staging="$5" relaunch="$6" limit="$7"
if [ -z "$current" ] || [ -z "$backup" ] || [ -z "$staging" ]; then exit 2; fi
ticks=0
while kill -0 "$pid" 2>/dev/null; do
  if [ "$ticks" -ge $((limit * 5)) ]; then rm -rf "$staging"; exit 1; fi
  sleep 0.2
  ticks=$((ticks + 1))
done
rm -rf "$backup"
if mv "$current" "$backup"; then
  if mv "$replacement" "$current"; then
    rm -rf "$backup"
  else
    rm -rf "$current"
    mv "$backup" "$current"
  fi
fi
rm -rf "$staging"
"$relaunch" "$current"
`;

/** The process name the helper shows in `ps`, given as `$0` to the shell. */
const HELPER_NAME = 'mboard-app-update';

/** The shell and its arguments that run the swap helper for `plan`. */
export function swapCommand(plan: SwapPlan): {
  command: string;
  args: string[];
} {
  return {
    command: '/bin/sh',
    args: [
      '-c',
      SWAP_SCRIPT,
      HELPER_NAME,
      String(plan.processId),
      plan.currentBundle,
      plan.replacementBundle,
      plan.backupBundle,
      plan.stagingFolder,
      plan.relaunchCommand,
      String(plan.waitLimitSeconds),
    ],
  };
}
