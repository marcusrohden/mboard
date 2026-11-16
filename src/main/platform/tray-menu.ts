import type { Preferences } from '../../shared/contract';
import type { TrayMenuItem } from './adapters';

export interface TrayMenuActions {
  openWindow(): void;
  chooseFolder(): void;
  toggleOpenAtLogin(enabled: boolean): void;
  quit(): void;
}

const SEPARATOR: TrayMenuItem = { type: 'separator' };

/**
 * Builds the tray menu (spec section 6): Open mboard, Change board folder…, Open at login, a disabled
 * "Notifications unavailable" only after a failure, then Quit.
 */
export function buildTrayMenu(preferences: Preferences, actions: TrayMenuActions): TrayMenuItem[] {
  const notificationsUnavailable: TrayMenuItem[] =
    preferences.notificationsAvailable === false ? [{ label: 'Notifications unavailable', enabled: false }] : [];
  return [
    { label: 'Open mboard', click: actions.openWindow },
    { label: 'Change board folder…', click: actions.chooseFolder },
    SEPARATOR,
    {
      label: 'Open at login',
      type: 'checkbox',
      checked: preferences.openAtLogin,
      click: () => actions.toggleOpenAtLogin(!preferences.openAtLogin),
    },
    ...notificationsUnavailable,
    SEPARATOR,
    { label: 'Quit', click: actions.quit },
  ];
}
