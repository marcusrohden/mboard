import { useEffect, useState } from 'react';

/**
 * Loads a value from main once on mount and follows the pushes main sends for it. A push that arrives
 * while the first load is still in flight wins, because it is newer. The value is `null` until either
 * arrives. `load` and `subscribe` should be stable, such as bridge methods.
 */
export function useLoadedAndPushed<T>(
  load: () => Promise<T>,
  subscribe: (listener: (value: T) => void) => () => void,
): T | null {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    let hasPushed = false;
    let isMounted = true;
    const unsubscribe = subscribe((pushed) => {
      hasPushed = true;
      setValue(pushed);
    });
    load()
      .then((loaded) => {
        if (isMounted && !hasPushed) setValue(loaded);
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [load, subscribe]);

  return value;
}
