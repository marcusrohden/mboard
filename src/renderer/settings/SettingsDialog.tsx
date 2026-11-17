import type { AppState, Preferences } from '../../shared/contract';
import { appUpdateStageText, canInstallItself, isAppUpdateBusy, stageVersion } from '../app-update/app-update-text';
import { useAppUpdate } from '../app-update/AppUpdateProvider';
import { getMboardApi } from '../mboard-api';
import { FolderPicker } from '../screens/FolderPicker';
import { useLoadedAndPushed } from '../state/use-loaded-and-pushed';
import { useRunCommand } from '../state/use-run-command';
import { ShortcutHint, shortcutAttributes, useShortcut } from '../shortcuts/shortcuts';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { AgeColoursSection } from './AgeColoursSection';
import styles from './SettingsDialog.module.css';
import { SettingsSection } from './SettingsSection';

interface SettingsDialogProps {
  appState: AppState | null;
  onAppState: (state: AppState) => void;
  onClose: () => void;
}

function boardFolderText(appState: AppState | null): string {
  switch (appState?.kind) {
    case 'ready':
      return appState.boardPath;
    case 'unavailable':
      return `${appState.path} (can't be opened)`;
    default:
      return 'Not chosen';
  }
}

function notificationsText(available: boolean | null | undefined): string {
  if (available === true) return 'Notifications are working.';
  if (available === false) {
    return "macOS didn't show mboard's last notification, so reminders show on the board instead. You can allow notifications for mboard in System Settings › Notifications.";
  }
  return "mboard hasn't sent a notification yet, so it doesn't know whether they work.";
}

function BoardFolderSection({ appState, onAppState }: Pick<SettingsDialogProps, 'appState' | 'onAppState'>) {
  return (
    <SettingsSection title="Board folder">
      <p className={styles.value}>
        <code className={styles.path}>{boardFolderText(appState)}</code>
      </p>
      <FolderPicker onAccepted={onAppState} chooseLabel="Change folder…" />
    </SettingsSection>
  );
}

function StartupSection({ preferences }: { preferences: Preferences | null }) {
  const run = useRunCommand();
  const toggle = (enabled: boolean): void => void run((api) => api.setOpenAtLogin(enabled));
  useShortcut('toggleOpenAtLogin', () => toggle(!(preferences?.openAtLogin ?? false)), preferences !== null);
  return (
    <SettingsSection title="Open at login">
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={preferences?.openAtLogin ?? false}
          disabled={preferences === null}
          {...shortcutAttributes('toggleOpenAtLogin')}
          onChange={(event) => toggle(event.target.checked)}
        />
        Open mboard when you log in to your Mac
        <ShortcutHint id="toggleOpenAtLogin" />
      </label>
    </SettingsSection>
  );
}

function NotificationsSection({ preferences }: { preferences: Preferences | null }) {
  return (
    <SettingsSection title="Notifications">
      <p className={styles.muted}>{notificationsText(preferences?.notificationsAvailable)}</p>
    </SettingsSection>
  );
}

function AppUpdatesSection() {
  const { status, check, install, openReleasePage } = useAppUpdate();
  if (status === null) return null;
  const { stage } = status;
  const hasRelease = stageVersion(stage) !== null;
  const canInstall = canInstallItself(stage);
  const offersDownload = (stage.kind === 'available' && !canInstall) || (stage.kind === 'failed' && hasRelease);

  return (
    <SettingsSection title="App updates">
      <p className={styles.value}>mboard {status.currentVersion}</p>
      <p role="status" className={styles.muted}>
        {appUpdateStageText(stage)}
      </p>
      {stage.kind === 'available' && stage.installBlocker !== null && (
        <p className={styles.muted}>{stage.installBlocker}</p>
      )}
      <div className={styles.actions}>
        <Button disabled={isAppUpdateBusy(stage)} shortcut="checkForUpdates" onClick={check}>
          Check for updates
        </Button>
        {canInstall && (
          <Button variant="primary" shortcut="installUpdate" onClick={install}>
            Install and restart
          </Button>
        )}
        {offersDownload && (
          <Button shortcut="downloadUpdate" onClick={openReleasePage}>
            Download from GitHub
          </Button>
        )}
        {hasRelease && !offersDownload && (
          <Button variant="quiet" shortcut="releaseNotes" onClick={openReleasePage}>
            Release notes
          </Button>
        )}
      </div>
    </SettingsSection>
  );
}

/**
 * The Settings dialog: the board folder (changed with the same checks as setup), open at login, the age
 * colours and the working days each starts from, whether notifications work, and app updates with
 * **Check for updates**.
 */
export function SettingsDialog({ appState, onAppState, onClose }: SettingsDialogProps) {
  const api = getMboardApi();
  const preferences = useLoadedAndPushed(api.getPreferences, api.onPreferences);

  return (
    <Modal label="Settings" onClose={onClose}>
      <h2 className={styles.title}>Settings</h2>
      <BoardFolderSection appState={appState} onAppState={onAppState} />
      <StartupSection preferences={preferences} />
      <AgeColoursSection />
      <NotificationsSection preferences={preferences} />
      <AppUpdatesSection />
      <div className={styles.footer}>
        <Button variant="primary" shortcut="cancel" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
