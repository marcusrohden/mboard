import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DebouncedSaver } from './debounced-saver';

describe('DebouncedSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves only the latest value once the burst is quiet', async () => {
    const save = vi.fn(async () => undefined);
    const saver = new DebouncedSaver<number>(save, 500);
    saver.schedule(1);
    vi.advanceTimersByTime(300);
    saver.schedule(2);
    vi.advanceTimersByTime(300);
    expect(save).not.toHaveBeenCalled();
    expect(saver.isBusy).toBe(true);

    await vi.advanceTimersByTimeAsync(200);
    expect(save.mock.calls).toEqual([[2]]);
    expect(saver.isBusy).toBe(false);
  });

  it('saves a waiting value straight away on flush, and keeps going after a failed save', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const saver = new DebouncedSaver<number>(save, 500);
    saver.schedule(1);
    await saver.flush();
    saver.schedule(2);
    await saver.flush();

    expect(save.mock.calls).toEqual([[1], [2]]);
    expect(saver.isBusy).toBe(false);
  });
});
