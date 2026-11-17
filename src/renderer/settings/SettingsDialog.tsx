import { useId, type ReactNode } from 'react';
import type { AppState, Preferences } from '../../shared/contract';
import {
  appUpdateStageText,
  canInstallItself,
  isAppUpdateBusy,
  stageVersion,
} from '../app-update/app-update-text';
import { useAppUpdate } from '../app-update/AppUpdateProvider';
import { getMboardApi } from '../mboard-api';
import { FolderPicker } from '../screens/FolderPicker';
import { useLoadedAndPushed } from '../state/use-loaded-and-pushed';
import { useRunCommand } from '../state/use-run-command';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import styles from './SettingsDialog.module.css';

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

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h3 id={headingId} className={styles.heading}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function BoardFolderSection({
  appState,
  onAppState,
}: Pick<SettingsDialogProps, 'appState' | 'onAppState'>) {
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
  return (
    <SettingsSection title="Open at login">
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={preferences?.openAtLogin ?? false}
          disabled={preferences === null}
          onChange={(event) => {
            const enabled = event.target.checked;
            void run((api) => api.setOpenAtLogin(enabled));
          }}
        />
        Open mboard when you log in to your Mac
      </label>
    </SettingsSection>
  );
}

function NotificationsSection({
  preferences,
}: {
  preferences: Preferences | null;
}) {
  return (
    <SettingsSection title="Notifications">
      <p className={styles.muted}>
        {notificationsText(preferences?.notificationsAvailable)}
      </p>
    </SettingsSection>
  );
}

function AppUpdatesSection() {
  const { status, check, install, openReleasePage } = useAppUpdate();
  if (status === null) return null;
  const { stage } = status;
  const hasRelease = stageVersion(stage) !== null;
  const canInstall = canInstallItself(stage);
  const offersDownload =
    (stage.kind === 'available' && !canInstall) ||
    (stage.kind === 'failed' && hasRelease);

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
        <Button disabled={isAppUpdateBusy(stage)} onClick={check}>
          Check for updates
        </Button>
        {canInstall && (
          <Button variant="primary" onClick={install}>
            Install and restart
          </Button>
        )}
        {offersDownload && (
          <Button onClick={openReleasePage}>Download from GitHub</Button>
        )}
        {hasRelease && !offersDownload && (
          <Button variant="quiet" onClick={openReleasePage}>
            Release notes
          </Button>
        )}
      </div>
    </SettingsSection>
  );
}

/**
 * The Settings dialog: the board folder (changed with the same checks as setup), open at login, whether
 * notifications work, and app updates with **Check for updates**.
 */
export function SettingsDialog({
  appState,
  onAppState,
  onClose,
}: SettingsDialogProps) {
  const api = getMboardApi();
  const preferences = useLoadedAndPushed(api.getPreferences, api.onPreferences);

  return (
    <Modal label="Settings" onClose={onClose}>
      <h2 className={styles.title}>Settings</h2>
      <BoardFolderSection appState={appState} onAppState={onAppState} />
      <StartupSection preferences={preferences} />
      <NotificationsSection preferences={preferences} />
      <AppUpdatesSection />
      <div className={styles.footer}>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
