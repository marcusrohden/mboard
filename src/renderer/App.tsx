import styles from './App.module.css';
import { useAppState, type AppStateLoad } from './use-app-state';

/**
 * Root component of the renderer. Placeholder until the renderer build lands.
 */
export function App() {
  const load = useAppState();

  return (
    <main className={styles.app}>
      <h1 className={styles.title}>mboard</h1>
      <p className={styles.bridgeStatus}>
        App state: <output aria-label="App state">{describeLoad(load)}</output>
      </p>
    </main>
  );
}

function describeLoad(load: AppStateLoad): string {
  switch (load.status) {
    case 'loading':
      return 'loading…';
    case 'loaded':
      return load.state.kind;
    case 'failed':
      return `unavailable (${load.message})`;
  }
}
