import { useCallback, useRef, useState } from 'react';
import { useRunCommand } from '../state/use-run-command';

export interface OpenAgent {
  open: () => void;
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

  const open = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsOpening(true);
    void run((api) => api.openAgent()).finally(() => {
      inFlight.current = false;
      setIsOpening(false);
    });
  }, [run]);

  return { open, isOpening };
}
