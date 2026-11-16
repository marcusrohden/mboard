import { useCallback } from 'react';
import type { MboardApi } from '../../shared/contract';
import { getMboardApi } from '../mboard-api';
import { useToasts } from '../notices/ToastProvider';

export type CommandResult<T> = { ok: true; value: T } | { ok: false };

export type RunCommand = <T>(command: (api: MboardApi) => Promise<T>) => Promise<CommandResult<T>>;

/**
 * Returns a function that runs one bridge command and shows a rejection's message in a toast.
 * The result says whether the command succeeded, so callers can decide whether to close a dialog.
 */
export function useRunCommand(): RunCommand {
  const notify = useToasts();
  return useCallback<RunCommand>(
    async (command) => {
      try {
        return { ok: true, value: await command(getMboardApi()) };
      } catch (error: unknown) {
        notify(error instanceof Error ? error.message : String(error));
        return { ok: false };
      }
    },
    [notify],
  );
}
