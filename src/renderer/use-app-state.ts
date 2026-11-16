import { useEffect, useState } from 'react';
import type { AppState } from '../shared/contract';
import { getMboardApi } from './mboard-api';

/**
 * Progress of loading the app state from the main process.
 */
export type AppStateLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly state: AppState }
  | { readonly status: 'failed'; readonly message: string };

/**
 * Loads the app state once on mount and follows later changes pushed by main.
 */
export function useAppState(): AppStateLoad {
  const [load, setLoad] = useState<AppStateLoad>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;
    const api = getMboardApi();
    const unsubscribe = api.onAppState((state) => setLoad({ status: 'loaded', state }));
    api
      .getAppState()
      .then((state) => isMounted && setLoad({ status: 'loaded', state }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (isMounted) setLoad({ status: 'failed', message });
      });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return load;
}
