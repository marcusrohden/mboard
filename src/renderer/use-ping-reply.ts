import { useEffect, useState } from 'react';
import { getMboardApi } from './mboard-api';

/**
 * Progress of the startup round trip to the main process.
 */
export type PingState =
  | { readonly status: 'waiting' }
  | { readonly status: 'replied'; readonly reply: string }
  | { readonly status: 'failed'; readonly message: string };

/**
 * Pings the main process once on mount and reports the outcome.
 */
export function usePingReply(): PingState {
  const [state, setState] = useState<PingState>({ status: 'waiting' });

  useEffect(() => {
    let isMounted = true;
    void requestPing().then((nextState) => {
      if (isMounted) {
        setState(nextState);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}

async function requestPing(): Promise<PingState> {
  try {
    return { status: 'replied', reply: await getMboardApi().ping() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', message };
  }
}
