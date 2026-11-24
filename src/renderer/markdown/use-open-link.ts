import { useCallback } from 'react';
import { useRunCommand } from '../state/use-run-command';

/** Opens a link from rendered markdown outside the app, through main. A refusal shows as a toast. */
export function useOpenLink(): (url: string) => Promise<boolean> {
  const run = useRunCommand();
  return useCallback(async (url: string) => (await run((api) => api.openLink(url))).ok, [run]);
}
