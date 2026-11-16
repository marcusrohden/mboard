import type { Preferences, ReminderBannerItem } from '../../shared/contract';

type Listener<T> = (value: T) => void;

function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The platform's observable state: the preferences the renderer shows, and the in-memory reminder banner.
 * Listeners fire only when a value actually changes.
 */
export class PlatformState {
  private openAtLogin = false;
  private notificationsAvailable: boolean | null = null;
  private banner: ReminderBannerItem[] = [];
  private readonly bannerListeners = new Set<Listener<ReminderBannerItem[]>>();
  private readonly preferencesListeners = new Set<Listener<Preferences>>();

  preferences(): Preferences {
    return { openAtLogin: this.openAtLogin, notificationsAvailable: this.notificationsAvailable };
  }

  reminderBanner(): ReminderBannerItem[] {
    return [...this.banner];
  }

  onBannerChange(listener: Listener<ReminderBannerItem[]>): () => void {
    return subscribe(this.bannerListeners, listener);
  }

  onPreferencesChange(listener: Listener<Preferences>): () => void {
    return subscribe(this.preferencesListeners, listener);
  }

  setOpenAtLogin(enabled: boolean): void {
    this.updatePreferences({ openAtLogin: enabled, notificationsAvailable: this.notificationsAvailable });
  }

  /**
   * Records the outcome of one delivery attempt. A failure also puts its `items` in the banner, replacing
   * any earlier entry for the same task.
   */
  recordDelivery(result: 'shown' | 'failed', items: readonly ReminderBannerItem[]): void {
    this.updatePreferences({ openAtLogin: this.openAtLogin, notificationsAvailable: result === 'shown' });
    if (result === 'failed') {
      this.addToBanner(items);
    }
  }

  dismissBanner(): void {
    if (this.banner.length === 0) {
      return;
    }
    this.banner = [];
    this.emitBanner();
  }

  private addToBanner(items: readonly ReminderBannerItem[]): void {
    if (items.length === 0) {
      return;
    }
    const replacedIds = new Set(items.map((item) => item.taskId));
    this.banner = [...this.banner.filter((item) => !replacedIds.has(item.taskId)), ...items];
    this.emitBanner();
  }

  private updatePreferences(next: Preferences): void {
    const current = this.preferences();
    if (current.openAtLogin === next.openAtLogin && current.notificationsAvailable === next.notificationsAvailable) {
      return;
    }
    this.openAtLogin = next.openAtLogin;
    this.notificationsAvailable = next.notificationsAvailable;
    this.preferencesListeners.forEach((listener) => listener(this.preferences()));
  }

  private emitBanner(): void {
    this.bannerListeners.forEach((listener) => listener(this.reminderBanner()));
  }
}
