import type { TaskId } from '../../shared/contract';
import type { NotificationRequest, Notifier } from '../ports';
import type { NotificationLog } from './notification-log';

/** How long to wait for macOS to report `show` or `failed` before treating the notification as failed. */
export const NOTIFICATION_TIMEOUT_MS = 10_000;

/** A single system notification, abstracted from Electron's `Notification` so the logic here is unit-testable. */
export interface NotificationHandle {
  onShow(listener: () => void): void;
  onFailed(listener: (detail: string) => void): void;
  onClick(listener: () => void): void;
  show(): void;
}

export interface Countdown {
  start(callback: () => void, delayMs: number): () => void;
}

export interface SystemNotifierOptions {
  isSupported(): boolean;
  create(request: NotificationRequest): NotificationHandle;
  onActivate(taskId: TaskId | null): void;
  countdown: Countdown;
  log: NotificationLog;
  timeoutMs?: number;
}

/**
 * Posts notifications through the operating system. The result is `shown` once the system reports `show`, and
 * `failed` when it reports `failed`, when notifications aren't supported, or when neither arrives in time.
 * Every outcome is logged. A click on a notification calls `onActivate` with its task id, or `null` for the board.
 */
export function createSystemNotifier(options: SystemNotifierOptions): Notifier {
  const { isSupported, create, onActivate, countdown, log, timeoutMs = NOTIFICATION_TIMEOUT_MS } = options;

  async function notify(request: NotificationRequest): Promise<'shown' | 'failed'> {
    if (!isSupported()) {
      return settle(request, 'failed', 'notifications are not supported');
    }
    const outcome = await awaitOutcome(request);
    return settle(request, outcome.result, outcome.detail);
  }

  function awaitOutcome(request: NotificationRequest): Promise<{ result: 'shown' | 'failed'; detail?: string }> {
    return new Promise((resolve) => {
      let cancelCountdown = (): void => undefined;
      let settled = false;
      const finish = (result: 'shown' | 'failed', detail?: string): void => {
        if (settled) return;
        settled = true;
        cancelCountdown();
        resolve(detail === undefined ? { result } : { result, detail });
      };
      try {
        const handle = create(request);
        handle.onShow(() => finish('shown'));
        handle.onFailed((detail) => finish('failed', detail));
        handle.onClick(() => onActivate(request.taskId));
        cancelCountdown = countdown.start(() => finish('failed', `no response within ${timeoutMs} ms`), timeoutMs);
        handle.show();
      } catch (error) {
        finish('failed', error instanceof Error ? error.message : String(error));
      }
    });
  }

  async function settle(
    request: NotificationRequest,
    result: 'shown' | 'failed',
    detail?: string,
  ): Promise<'shown' | 'failed'> {
    await log.record(detail === undefined ? { title: request.title, result } : { title: request.title, result, detail });
    return result;
  }

  return { notify };
}
