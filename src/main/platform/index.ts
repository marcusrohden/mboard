import type { Preferences, ReminderBannerItem } from '../../shared/contract';
import type { Platform, PlatformFactory } from '../ports';

/**
 * Builds the platform layer. Until the platform build lands this is an inert placeholder, so the
 * composition root can wire it already.
 */
export const createPlatform: PlatformFactory = () => createInertPlatform();

function createInertPlatform(): Platform {
  const preferences: Preferences = { openAtLogin: false, notificationsAvailable: null };
  const noBanner: ReminderBannerItem[] = [];
  return {
    start: () => undefined,
    stop: () => undefined,
    preferences: () => preferences,
    setOpenAtLogin: async () => preferences,
    reminderBanner: () => noBanner,
    dismissReminderBanner: () => undefined,
    onBannerChange: () => () => undefined,
    onPreferencesChange: () => () => undefined,
  };
}
