import { useCallback, useRef, useState } from 'react';
import type { AgentPromptId } from '../../shared/contract';
import { useRunCommand } from '../state/use-run-command';

export interface OpenAgent {
  /** Opens the agent with a saved prompt, and resolves with whether the terminal was asked to start it. */
  open: (promptId: AgentPromptId) => Promise<boolean>;
  isOpening: boolean;
}

/**
 * Opens the agent through main, showing any failure in a toast. A second press while the first is still on
 * its way does nothing, so one press never opens two terminals.
 */
export function useOpenAgent(): OpenAgent {
  const run = useRunCommand();
  const [isOpening, setIsOpening] = useState(false);
  const inFlight = useRef(false);

  const open = useCallback(
    async (promptId: AgentPromptId) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setIsOpening(true);
      try {
        return (await run((api) => api.openAgent(promptId))).ok;
      } finally {
        inFlight.current = false;
        setIsOpening(false);
      }
    },
    [run],
  );

  return { open, isOpening };
}
