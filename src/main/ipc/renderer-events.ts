import type { AppState, EventName, MboardEventPayloads } from '../../shared/contract';
import type { AppUpdates, BoardService, Platform } from '../ports';

/** Sends one push event to the renderer. */
export type RendererEventSender = <Event extends EventName>(event: Event, payload: MboardEventPayloads[Event]) => void;

/** Where push events come from. */
export interface RendererEventSources {
  board: Pick<BoardService, 'onChange' | 'snapshot'>;
  setup: { onStateChange(listener: (state: AppState) => void): () => void };
  platform: Pick<Platform, 'onBannerChange' | 'onPreferencesChange'>;
  appUpdates: Pick<AppUpdates, 'onChange'>;
}

/** How often a fresh snapshot is pushed even when nothing changed, so `now` and `today` roll over. */
export const SNAPSHOT_REFRESH_INTERVAL_MS = 60_000;

/**
 * Forwards every change the renderer must hear about: a snapshot after each board scan or write, the app
 * state after each setup change, the platform's reminder banner and preferences, and the app update status.
 * It also pushes a fresh snapshot every minute, carrying the main process's clock, so the board rolls over
 * at midnight.
 *
 * Returns a function that stops forwarding and clears the timer.
 */
export function bridgeRendererEvents(
  sources: RendererEventSources,
  send: RendererEventSender,
  refreshIntervalMs: number = SNAPSHOT_REFRESH_INTERVAL_MS,
): () => void {
  const unsubscribers = [
    sources.board.onChange((snapshot) => send('snapshot', snapshot)),
    sources.setup.onStateChange((state) => send('appState', state)),
    sources.platform.onBannerChange((items) => send('reminderBanner', items)),
    sources.platform.onPreferencesChange((preferences) => send('preferences', preferences)),
    sources.appUpdates.onChange((status) => send('appUpdateStatus', status)),
  ];
  const refreshTimer = setInterval(() => send('snapshot', sources.board.snapshot()), refreshIntervalMs);
  return () => {
    clearInterval(refreshTimer);
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
