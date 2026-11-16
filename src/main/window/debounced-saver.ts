/**
 * Saves only the latest of a burst of values, once the burst has been quiet for `delayMs`. `flush` saves a
 * waiting value straight away and resolves once every save has finished, so pending work can be finished
 * before the app quits. A failed save is logged and never stops later saves.
 */
export class DebouncedSaver<T> {
  private waiting: { value: T } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();
  private savesInFlight = 0;

  constructor(
    private readonly save: (value: T) => Promise<unknown>,
    private readonly delayMs: number,
  ) {}

  /** Whether a value is waiting or still being saved. */
  get isBusy(): boolean {
    return this.waiting !== null || this.savesInFlight > 0;
  }

  schedule(value: T): void {
    this.waiting = { value };
    this.clearTimer();
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  flush(): Promise<void> {
    this.clearTimer();
    const waiting = this.waiting;
    this.waiting = null;
    if (waiting !== null) this.saving = this.saving.then(() => this.saveLogged(waiting.value));
    return this.saving;
  }

  cancel(): void {
    this.clearTimer();
    this.waiting = null;
  }

  private async saveLogged(value: T): Promise<void> {
    this.savesInFlight += 1;
    try {
      await this.save(value);
    } catch (error) {
      console.error('mboard could not save a setting:', error);
    } finally {
      this.savesInFlight -= 1;
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
