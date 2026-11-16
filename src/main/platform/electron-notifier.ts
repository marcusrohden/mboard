import { Notification } from 'electron';
import type { Notifier } from '../ports';
import type { NotifierContext } from './adapters';
import type { NotificationLog } from './notification-log';
import { createSystemNotifier, type NotificationHandle } from './system-notifier';
import { realCountdown } from './real-timers';

/**
 * Keeps each live notification referenced until macOS closes it, because Electron stops delivering a
 * notification's events once it has been garbage collected.
 */
const liveNotifications = new Set<Notification>();

function handleFor(request: { title: string; body: string }): NotificationHandle {
  const notification = new Notification({ title: request.title, body: request.body });
  liveNotifications.add(notification);
  notification.on('close', () => liveNotifications.delete(notification));
  return {
    onShow: (listener) => notification.on('show', listener),
    onFailed: (listener) => notification.on('failed', (_event, error) => listener(String(error))),
    onClick: (listener) => notification.on('click', listener),
    show: () => notification.show(),
  };
}

/** Delivers reminders as macOS notifications through Electron's `Notification`. */
export function createElectronNotifier(context: NotifierContext, log: NotificationLog): Notifier {
  return createSystemNotifier({
    isSupported: () => Notification.isSupported(),
    create: handleFor,
    onActivate: (taskId) => (taskId === null ? context.showWindow() : context.showWindow(taskId)),
    countdown: realCountdown,
    log,
  });
}
