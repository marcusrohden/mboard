import type { MboardApi } from '../preload/bridge-contract';

/**
 * Returns the bridge the preload script exposes as `window.mboard`.
 *
 * @throws {Error} when the preload script did not run, so the bridge is missing.
 */
export function getMboardApi(): MboardApi {
  const api = window.mboard;
  if (api === undefined) {
    throw new Error(
      'window.mboard is missing: the preload script did not run.',
    );
  }
  return api;
}
