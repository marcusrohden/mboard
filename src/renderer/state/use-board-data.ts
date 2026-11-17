import { useCallback, useState } from 'react';
import type { BoardSnapshot, Preferences, ReminderBannerItem } from '../../shared/contract';
import { getMboardApi } from '../mboard-api';
import { useLoadedAndPushed } from './use-loaded-and-pushed';

export interface BoardData {
  snapshot: BoardSnapshot | null;
  banner: readonly ReminderBannerItem[];
  preferences: Preferences | null;
  dismissBanner: () => void;
}

/**
 * Loads the board snapshot, the reminder banner and the preferences when the board opens, and keeps
 * them current from the main process's pushes. A push that arrives while the first load is still in
 * flight wins, because it is newer.
 */
export function useBoardData(): BoardData {
  const api = getMboardApi();
  const snapshot = useLoadedAndPushed(api.getSnapshot, api.onSnapshot);
  const pushedBanner = useLoadedAndPushed(api.getReminderBanner, api.onReminderBanner);
  const preferences = useLoadedAndPushed(api.getPreferences, api.onPreferences);
  const [dismissedBanner, setDismissedBanner] = useState<readonly ReminderBannerItem[] | null>(null);

  const dismissBanner = useCallback(() => {
    setDismissedBanner(pushedBanner ?? []);
  }, [pushedBanner]);

  const banner = pushedBanner === null || pushedBanner === dismissedBanner ? [] : pushedBanner;
  return { snapshot, banner, preferences, dismissBanner };
}
