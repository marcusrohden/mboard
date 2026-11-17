import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppState } from '../../shared/contract';
import { getMboardApi } from '../mboard-api';
import { SettingsDialog } from './SettingsDialog';

/** Opens and closes the Settings dialog, and says whether it is open. */
export interface SettingsDialogControls {
  isOpen: boolean;
  open(): void;
  close(): void;
}

const SettingsContext = createContext<SettingsDialogControls | null>(null);

interface SettingsProviderProps {
  /** The current app state, or `null` while it loads. Settings shows its board folder. */
  appState: AppState | null;
  /** Adopts the app state a folder change in Settings returned. */
  onAppState: (state: AppState) => void;
  children: ReactNode;
}

/**
 * Hosts the Settings dialog for the whole app, so it opens on every screen. It opens from the header's
 * gear and from the app or tray menu: main pushes `openSettings`, and the request is also taken on mount
 * in case the push arrived before this component subscribed.
 */
export function SettingsProvider({
  appState,
  onAppState,
  children,
}: SettingsProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const api = getMboardApi();
    const openIfRequested = (): void => {
      api
        .takeOpenSettingsRequest()
        .then((isRequested) => {
          if (isRequested) setIsOpen(true);
        })
        .catch(() => undefined);
    };
    const unsubscribe = api.onOpenSettings(openIfRequested);
    openIfRequested();
    return unsubscribe;
  }, []);

  const controls = useMemo<SettingsDialogControls>(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );
  return (
    <SettingsContext.Provider value={controls}>
      {children}
      {isOpen && (
        <SettingsDialog
          appState={appState}
          onAppState={onAppState}
          onClose={close}
        />
      )}
    </SettingsContext.Provider>
  );
}

/**
 * Returns the Settings dialog's controls.
 *
 * @throws {Error} when used outside a `SettingsProvider`.
 */
export function useSettingsDialog(): SettingsDialogControls {
  const controls = useContext(SettingsContext);
  if (controls === null)
    throw new Error(
      'useSettingsDialog must be used inside a SettingsProvider.',
    );
  return controls;
}
