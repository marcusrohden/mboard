import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, AppUpdateStatus, BoardSnapshot, Preferences, ReminderBannerItem } from '../../shared/contract';
import { bridgeRendererEvents, SNAPSHOT_REFRESH_INTERVAL_MS, type RendererEventSources } from './renderer-events';

function listenerSlot<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    subscribe: (listener: (value: T) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (value: T) => listeners.forEach((listener) => listener(value)),
    get count() {
      return listeners.size;
    },
  };
}

describe('bridgeRendererEvents', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('forwards every source to its event and pushes a fresh snapshot every minute until stopped', () => {
    const board = listenerSlot<BoardSnapshot>();
    const appState = listenerSlot<AppState>();
    const banner = listenerSlot<ReminderBannerItem[]>();
    const preferences = listenerSlot<Preferences>();
    const appUpdates = listenerSlot<AppUpdateStatus>();
    let minute = 0;
    const snapshotAt = (): BoardSnapshot => ({ tasks: [], unreadable: [], now: `minute ${minute}`, today: '2026-11-16' });
    const sources: RendererEventSources = {
      board: { onChange: board.subscribe, snapshot: snapshotAt },
      setup: { onStateChange: appState.subscribe },
      platform: { onBannerChange: banner.subscribe, onPreferencesChange: preferences.subscribe },
      appUpdates: { onChange: appUpdates.subscribe },
    };
    const send = vi.fn();
    const stop = bridgeRendererEvents(sources, send);

    board.emit(snapshotAt());
    appState.emit({ kind: 'needsSetup' });
    banner.emit([]);
    preferences.emit({ openAtLogin: true, notificationsAvailable: false });
    appUpdates.emit({ currentVersion: '0.1.0', stage: { kind: 'checking' } });
    minute = 1;
    vi.advanceTimersByTime(SNAPSHOT_REFRESH_INTERVAL_MS);

    expect(send.mock.calls).toEqual([
      ['snapshot', expect.objectContaining({ now: 'minute 0' })],
      ['appState', { kind: 'needsSetup' }],
      ['reminderBanner', []],
      ['preferences', { openAtLogin: true, notificationsAvailable: false }],
      ['appUpdateStatus', { currentVersion: '0.1.0', stage: { kind: 'checking' } }],
      ['snapshot', expect.objectContaining({ now: 'minute 1' })],
    ]);

    stop();
    vi.advanceTimersByTime(SNAPSHOT_REFRESH_INTERVAL_MS * 3);
    expect(send).toHaveBeenCalledTimes(6);
    expect([board.count, appState.count, banner.count, preferences.count, appUpdates.count]).toEqual([0, 0, 0, 0, 0]);
  });
});
