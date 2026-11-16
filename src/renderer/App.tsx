import styles from './App.module.css';
import { usePingReply, type PingState } from './use-ping-reply';

/**
 * Root component of the renderer.
 */
export function App() {
  const pingState = usePingReply();

  return (
    <main className={styles.app}>
      <h1 className={styles.title}>mboard</h1>
      <p className={styles.bridgeStatus}>
        Main process:{' '}
        <output aria-label="Ping reply">{describePing(pingState)}</output>
      </p>
    </main>
  );
}

function describePing(state: PingState): string {
  switch (state.status) {
    case 'waiting':
      return 'waiting for a reply…';
    case 'replied':
      return state.reply;
    case 'failed':
      return `no reply (${state.message})`;
  }
}
