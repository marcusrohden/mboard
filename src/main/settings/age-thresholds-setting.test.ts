import { describe, expect, it } from 'vitest';
import type { AgeThresholds } from '../../shared/contract';
import { FakeSettings } from '../platform/testing/fakes';
import { StoredAgeThresholds } from './age-thresholds-setting';

const CUSTOM: AgeThresholds = { nudgeFrom: 3, stallingFrom: 5, staleFrom: 10 };

async function loaded(initial: AgeThresholds) {
  const settings = new FakeSettings({ ageThresholds: initial });
  const thresholds = new StoredAgeThresholds(settings);
  await thresholds.load();
  return { settings, thresholds };
}

describe('StoredAgeThresholds', () => {
  it('starts with the defaults and takes the saved thresholds on load', async () => {
    const settings = new FakeSettings({ ageThresholds: CUSTOM });
    const thresholds = new StoredAgeThresholds(settings);
    expect(thresholds.get()).toEqual({ nudgeFrom: 2, stallingFrom: 4, staleFrom: 6 });
    await thresholds.load();
    expect(thresholds.get()).toEqual(CUSTOM);
  });

  it('saves new thresholds and tells listeners once', async () => {
    const { settings, thresholds } = await loaded({ nudgeFrom: 2, stallingFrom: 4, staleFrom: 6 });
    const heard: AgeThresholds[] = [];
    thresholds.onChange((next) => heard.push(next));

    await expect(thresholds.set(CUSTOM)).resolves.toEqual(CUSTOM);
    await thresholds.set(CUSTOM);

    expect(settings.updates).toEqual([{ ageThresholds: CUSTOM }, { ageThresholds: CUSTOM }]);
    expect(thresholds.get()).toEqual(CUSTOM);
    expect(heard).toEqual([CUSTOM]);
  });

  it('refuses thresholds out of order without saving them', async () => {
    const { settings, thresholds } = await loaded(CUSTOM);
    await expect(thresholds.set({ nudgeFrom: 4, stallingFrom: 4, staleFrom: 6 })).rejects.toThrow(
      'Needs a nudge must start before Stalling, and Stalling before Stale.',
    );
    expect(settings.updates).toEqual([]);
    expect(thresholds.get()).toEqual(CUSTOM);
  });

  it('stops telling a listener once it unsubscribes', async () => {
    const { thresholds } = await loaded(CUSTOM);
    const heard: AgeThresholds[] = [];
    const unsubscribe = thresholds.onChange((next) => heard.push(next));
    unsubscribe();
    await thresholds.set({ nudgeFrom: 1, stallingFrom: 2, staleFrom: 3 });
    expect(heard).toEqual([]);
  });
});
