import type { AppState } from '../shared/contract';
import styles from './App.module.css';
import { AppUpdateNotice } from './app-update/AppUpdateNotice';
import { AppUpdateProvider } from './app-update/AppUpdateProvider';
import { ToastProvider } from './notices/ToastProvider';
import { BoardScreen } from './screens/BoardScreen';
import { SetupScreen } from './screens/SetupScreen';
import { UnavailableScreen } from './screens/UnavailableScreen';
import screenStyles from './screens/Screens.module.css';
import { SettingsProvider } from './settings/SettingsProvider';
import { AgeThresholdsProvider } from './state/age-thresholds';
import { ShortcutProvider } from './shortcuts/shortcuts';
import { useAppState, type AppStateLoad } from './state/use-app-state';

interface AppRoutesProps {
  load: AppStateLoad;
  applyState: (state: AppState) => void;
}

function AppRoutes({ load, applyState }: AppRoutesProps) {
  if (load.status === 'loading') {
    return (
      <p role="status" className={screenStyles.status}>
        Loading…
      </p>
    );
  }
  if (load.status === 'failed') {
    return (
      <main className={screenStyles.screen}>
        <h1 className={screenStyles.heading}>Something went wrong</h1>
        <p role="alert" className={screenStyles.error}>
          {load.message}
        </p>
      </main>
    );
  }
  const { state } = load;
  switch (state.kind) {
    case 'needsSetup':
      return <SetupScreen onState={applyState} />;
    case 'unavailable':
      return <UnavailableScreen path={state.path} reason={state.reason} onState={applyState} />;
    case 'ready':
      return <BoardScreen boardName={state.boardName} />;
  }
}

function AppShell() {
  const { load, applyState } = useAppState();
  return (
    <AppUpdateProvider>
      <AgeThresholdsProvider>
        <SettingsProvider appState={load.status === 'loaded' ? load.state : null} onAppState={applyState}>
          <div className={styles.app}>
            <AppUpdateNotice />
            <div className={styles.content}>
              <AppRoutes load={load} applyState={applyState} />
            </div>
          </div>
        </SettingsProvider>
      </AgeThresholdsProvider>
    </AppUpdateProvider>
  );
}

/**
 * The application root: shows the setup screen, the "Can't open your board" screen or the board,
 * following the app state from the main process. Settings, the new version notice and the Command
 * shortcuts work on every screen.
 */
export function App() {
  return (
    <ShortcutProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </ShortcutProvider>
  );
}
