import type { TimerPort } from './adapters';
import type { Countdown } from './system-notifier';

/** Repeats a callback with `setInterval`. */
export const realTimers: TimerPort = {
  every(intervalMs, callback) {
    const handle = setInterval(callback, intervalMs);
    return () => clearInterval(handle);
  },
};

/** Waits once with `setTimeout`. */
export const realCountdown: Countdown = {
  start(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
};
