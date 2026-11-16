import type { LaunchConfig } from './launch-config';
import type { Clock } from './ports';

/**
 * The main process clock: the wall clock, or a fixed instant when `MBOARD_FAKE_NOW` is set.
 */
export function createClock(launchConfig: Pick<LaunchConfig, 'fakeNow'>): Clock {
  const fakeNow = launchConfig.fakeNow;
  if (fakeNow !== undefined) {
    return { now: () => new Date(fakeNow.getTime()) };
  }
  return { now: () => new Date() };
}
