import { dueCount, formatLocalDateTime, localDateOf, menuBarTitle } from '../../domain';
import type { Preferences } from '../../shared/contract';
import type { LaunchConfig } from '../launch-config';
import type { Platform, PlatformDependencies } from '../ports';
import type { PlatformAdapters, TrayPort } from './adapters';
import { PlatformState } from './platform-state';
import { createReminderScheduler } from './reminder-scheduler';
import { buildTrayMenu } from './tray-menu';

/** How often reminders are checked, apart from at launch and on wake. */
export const REMINDER_INTERVAL_MS = 60_000;

export interface MenuBarPlatformOptions {
  launchConfig: Pick<LaunchConfig, 'loginItemDisabled'>;
  adapters: PlatformAdapters;
}

interface RunningSession {
  dependencies: PlatformDependencies;
  tray: TrayPort;
  tick(): Promise<void>;
  teardown: Array<() => void>;
}

/**
 * The menu-bar platform (spec sections 2 and 6): a tray whose title follows the due count, reminders checked
 * at launch, every minute and on wake, and the open-at-login preference. All Electron and file system access
 * comes in through `adapters`, so everything here runs under test with fakes.
 */
export function createMenuBarPlatform(options: MenuBarPlatformOptions): Platform {
  const { launchConfig, adapters } = options;
  const state = new PlatformState();
  let session: RunningSession | null = null;

  function requireSession(): RunningSession {
    if (session === null) {
      throw new Error('The platform has not been started.');
    }
    return session;
  }

  function applyLoginItem(enabled: boolean): void {
    if (!launchConfig.loginItemDisabled) {
      adapters.loginItem.setOpenAtLogin(enabled);
    }
  }

  async function setOpenAtLogin(enabled: boolean): Promise<Preferences> {
    const { dependencies } = requireSession();
    await dependencies.settings.update({ openAtLogin: enabled });
    state.setOpenAtLogin(enabled);
    applyLoginItem(enabled);
    return state.preferences();
  }

  async function restoreOpenAtLogin(running: RunningSession): Promise<void> {
    const settings = await running.dependencies.settings.read();
    if (session !== running) return;
    state.setOpenAtLogin(settings.openAtLogin);
    if (settings.boardPath !== null) {
      applyLoginItem(settings.openAtLogin);
    }
  }

  function currentDueCount(running: RunningSession): number {
    const { board, clock } = running.dependencies;
    const today = localDateOf(formatLocalDateTime(clock.now()));
    return dueCount(board.snapshot().tasks, today);
  }

  function refreshTitle(running: RunningSession): void {
    running.tray.setTitle(menuBarTitle(currentDueCount(running)));
  }

  function refreshMenu(running: RunningSession): void {
    const { dependencies } = running;
    running.tray.setMenu(
      buildTrayMenu(state.preferences(), {
        openWindow: () => dependencies.showWindow(),
        chooseFolder: () => dependencies.chooseFolder(),
        toggleOpenAtLogin: (enabled) => {
          setOpenAtLogin(enabled).catch(adapters.reportError);
        },
        quit: () => dependencies.quit(),
      }),
    );
  }

  function start(dependencies: PlatformDependencies): void {
    if (session !== null) {
      stop();
    }
    const notifier = adapters.createNotifier({ clock: dependencies.clock, showWindow: dependencies.showWindow });
    const scheduler = createReminderScheduler({
      board: dependencies.board,
      clock: dependencies.clock,
      notifier,
      firedKeys: adapters.firedKeys,
      onDelivery: ({ result, bannerItems }) => state.recordDelivery(result, bannerItems),
    });
    const running: RunningSession = {
      dependencies,
      tray: adapters.createTray(),
      tick: async () => {
        refreshTitle(running);
        await scheduler.tick();
      },
      teardown: [],
    };
    session = running;
    const tick = (): void => {
      running.tick().catch(adapters.reportError);
    };
    running.teardown.push(
      state.onPreferencesChange(() => refreshMenu(running)),
      dependencies.board.onChange(() => refreshTitle(running)),
      adapters.timers.every(REMINDER_INTERVAL_MS, tick),
      adapters.powerMonitor.onResume(tick),
    );
    refreshMenu(running);
    refreshTitle(running);
    restoreOpenAtLogin(running).catch(adapters.reportError);
    tick();
  }

  function stop(): void {
    const running = session;
    session = null;
    if (running === null) return;
    running.teardown.forEach((dispose) => dispose());
    running.tray.destroy();
  }

  return {
    start,
    stop,
    preferences: () => state.preferences(),
    setOpenAtLogin,
    reminderBanner: () => state.reminderBanner(),
    dismissReminderBanner: () => state.dismissBanner(),
    onBannerChange: (listener) => state.onBannerChange(listener),
    onPreferencesChange: (listener) => state.onPreferencesChange(listener),
  };
}
