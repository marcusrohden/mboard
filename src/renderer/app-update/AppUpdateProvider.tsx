import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppUpdateStatus } from '../../shared/contract';
import { getMboardApi } from '../mboard-api';
import { useLoadedAndPushed } from '../state/use-loaded-and-pushed';
import { useRunCommand } from '../state/use-run-command';

/** The app update status from main, the commands that act on it, and the notice's "Later" for this session. */
export interface AppUpdateControls {
  status: AppUpdateStatus | null;
  check(): void;
  install(): void;
  openReleasePage(): void;
  /** The version whose notice was put off with Later in this session, if any. */
  dismissedVersion: string | null;
  dismiss(version: string): void;
}

const AppUpdateContext = createContext<AppUpdateControls | null>(null);

/**
 * Follows the app update status that main pushes, for the update notice and Settings. A rejected command
 * shows in a toast, so it must sit inside a `ToastProvider`.
 */
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const api = getMboardApi();
  const status = useLoadedAndPushed(
    api.getAppUpdateStatus,
    api.onAppUpdateStatus,
  );
  const run = useRunCommand();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const check = useCallback(
    () => void run((bridge) => bridge.checkForAppUpdate()),
    [run],
  );
  const install = useCallback(
    () => void run((bridge) => bridge.installAppUpdate()),
    [run],
  );
  const openReleasePage = useCallback(
    () => void run((bridge) => bridge.openAppUpdateReleasePage()),
    [run],
  );

  const controls = useMemo<AppUpdateControls>(
    () => ({
      status,
      check,
      install,
      openReleasePage,
      dismissedVersion,
      dismiss: setDismissedVersion,
    }),
    [status, check, install, openReleasePage, dismissedVersion],
  );
  return (
    <AppUpdateContext.Provider value={controls}>
      {children}
    </AppUpdateContext.Provider>
  );
}

/**
 * Returns the app update status and commands.
 *
 * @throws {Error} when used outside an `AppUpdateProvider`.
 */
export function useAppUpdate(): AppUpdateControls {
  const controls = useContext(AppUpdateContext);
  if (controls === null)
    throw new Error('useAppUpdate must be used inside an AppUpdateProvider.');
  return controls;
}
