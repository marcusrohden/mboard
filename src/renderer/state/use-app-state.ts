import { useCallback, useEffect, useState } from 'react';
import type { AppState } from '../../shared/contract';
import { getMboardApi } from '../mboard-api';

/**
 * Progress of loading the app state from the main process.
 */
export type AppStateLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly state: AppState }
  | { readonly status: 'failed'; readonly message: string };

/**
 * Loads the app state once on mount and follows later changes pushed by main. `applyState` lets a
 * screen adopt a state that a command returned, without waiting for the push.
 */
export function useAppState(): { load: AppStateLoad; applyState: (state: AppState) => void } {
  const [load, setLoad] = useState<AppStateLoad>({ status: 'loading' });

  const applyState = useCallback((state: AppState) => setLoad({ status: 'loaded', state }), []);

  useEffect(() => {
    let isMounted = true;
    const api = getMboardApi();
    const unsubscribe = api.onAppState(applyState);
    api
      .getAppState()
      .then((state) => isMounted && applyState(state))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (isMounted) setLoad({ status: 'failed', message });
      });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [applyState]);

  return { load, applyState };
}
