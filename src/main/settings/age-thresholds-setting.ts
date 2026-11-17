import { DEFAULT_AGE_THRESHOLDS, ageThresholdsProblem, sameAgeThresholds, type AgeThresholds } from '../../domain';
import type { AgeThresholdsSetting, SettingsStore } from '../ports';

type Listener = (thresholds: AgeThresholds) => void;

/**
 * The age-colour thresholds, read from `settings.json` once by `load` and kept in memory after that.
 * `set` writes new thresholds through the settings store and tells listeners when they changed.
 */
export class StoredAgeThresholds implements AgeThresholdsSetting {
  private current: AgeThresholds = { ...DEFAULT_AGE_THRESHOLDS };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly settings: SettingsStore) {}

  async load(): Promise<void> {
    this.apply((await this.settings.read()).ageThresholds);
  }

  get(): AgeThresholds {
    return { ...this.current };
  }

  /**
   * Saves `next` and resolves with the thresholds now in force.
   *
   * @throws Error with a user-presentable message when `next` isn't a valid set of thresholds.
   */
  async set(next: AgeThresholds): Promise<AgeThresholds> {
    const problem = ageThresholdsProblem(next);
    if (problem !== null) throw new Error(problem);
    this.apply((await this.settings.update({ ageThresholds: next })).ageThresholds);
    return this.get();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private apply(next: AgeThresholds): void {
    if (sameAgeThresholds(this.current, next)) return;
    this.current = { ...next };
    this.listeners.forEach((listener) => listener(this.get()));
  }
}
