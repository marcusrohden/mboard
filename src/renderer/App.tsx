import { ToastProvider } from './notices/ToastProvider';
import { BoardScreen } from './screens/BoardScreen';
import { SetupScreen } from './screens/SetupScreen';
import { UnavailableScreen } from './screens/UnavailableScreen';
import screenStyles from './screens/Screens.module.css';
import { useAppState } from './state/use-app-state';

function AppRoutes() {
  const { load, applyState } = useAppState();

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

/**
 * The application root: shows the setup screen, the "Can't open your board" screen or the board,
 * following the app state from the main process.
 */
export function App() {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}
