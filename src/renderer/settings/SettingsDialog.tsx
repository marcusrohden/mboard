import { useId, useState, type ReactNode } from 'react';
import type { AppState, Preferences } from '../../shared/contract';
import { appUpdateStageText, canInstallItself, isAppUpdateBusy, stageVersion } from '../app-update/app-update-text';
import { useAppUpdate } from '../app-update/AppUpdateProvider';
import { DownloadProgress } from '../app-update/DownloadProgress';
import { getMboardApi } from '../mboard-api';
import { FolderPicker } from '../screens/FolderPicker';
import { useLoadedAndPushed } from '../state/use-loaded-and-pushed';
import { useRunCommand } from '../state/use-run-command';
import { ShortcutHint, shortcutAttributes, useShortcut } from '../shortcuts/shortcuts';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { AgeColoursSection } from './AgeColoursSection';
import { AgentSection } from './AgentSection';
import styles from './SettingsDialog.module.css';
import { SettingsRow, SettingsSection } from './SettingsSection';
import { SettingsTabs, type SettingsTab } from './SettingsTabs';

type TabId = 'general' | 'board' | 'agent' | 'updates';

const TABS: ReadonlyArray<SettingsTab<TabId>> = [
  { id: 'general', label: 'General' },
  { id: 'board', label: 'Board' },
  { id: 'agent', label: 'Agent' },
  { id: 'updates', label: 'Updates' },
];

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
    <SettingsSection title="Board folder" note="The folder in your vault that holds the board's task files.">
      <SettingsRow
        label="Location"
        description={<code className={styles.path}>{boardFolderText(appState)}</code>}
        layout="stacked"
      >
        <FolderPicker onAccepted={onAppState} chooseLabel="Change folder…" />
      </SettingsRow>
    </SettingsSection>
  );
}

function StartupSection({ preferences }: { preferences: Preferences | null }) {
  const run = useRunCommand();
  const checkboxId = useId();
  const toggle = (enabled: boolean): void => void run((api) => api.setOpenAtLogin(enabled));
  useShortcut('toggleOpenAtLogin', () => toggle(!(preferences?.openAtLogin ?? false)), preferences !== null);
  return (
    <SettingsSection title="Startup">
      <SettingsRow
        label="Open mboard when you log in to your Mac"
        labelFor={checkboxId}
        description="mboard stays in the menu bar, so due-date reminders still arrive with its window closed."
      >
        <input
          id={checkboxId}
          type="checkbox"
          className={styles.checkbox}
          checked={preferences?.openAtLogin ?? false}
          disabled={preferences === null}
          {...shortcutAttributes('toggleOpenAtLogin')}
          onChange={(event) => toggle(event.target.checked)}
        />
        <ShortcutHint id="toggleOpenAtLogin" />
      </SettingsRow>
    </SettingsSection>
  );
}

function NotificationsSection({ preferences }: { preferences: Preferences | null }) {
  return (
    <SettingsSection title="Notifications">
      <SettingsRow label="Due-date reminders" description={notificationsText(preferences?.notificationsAvailable)} />
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
    <SettingsSection title="App updates" note="mboard checks GitHub for a new version every 6 hours.">
      <SettingsRow
        label={`mboard ${status.currentVersion}`}
        description={
          <>
            <p role="status" className={styles.status}>
              {appUpdateStageText(stage)}
            </p>
            {stage.kind === 'downloading' && <DownloadProgress percent={stage.percent} />}
            {stage.kind === 'available' && stage.installBlocker !== null && (
              <p className={styles.status}>{stage.installBlocker}</p>
            )}
          </>
        }
        layout="stacked"
      >
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
      </SettingsRow>
    </SettingsSection>
  );
}

interface TabPanelProps {
  tab: TabId;
  selected: TabId;
  idFor: (tab: TabId, part: 'tab' | 'panel') => string;
  children: ReactNode;
}

/**
 * One tab's panel. Hidden panels stay mounted, so their shortcuts keep working and nothing typed in them is
 * lost when another tab is shown.
 */
function TabPanel({ tab, selected, idFor, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={idFor(tab, 'panel')}
      aria-labelledby={idFor(tab, 'tab')}
      hidden={tab !== selected}
      className={styles.tabPanel}
    >
      {children}
    </div>
  );
}

/**
 * The Settings dialog, in four tabs: General (the board folder, changed with the same checks as setup, open at
 * login and whether notifications work), Board (the age colours and the working days each starts from), Agent
 * (how **Open agent** starts the agent) and Updates (the running version and **Check for updates**). It opens on
 * General. **Done**, ⌘. or Esc closes it.
 */
export function SettingsDialog({ appState, onAppState, onClose }: SettingsDialogProps) {
  const api = getMboardApi();
  const preferences = useLoadedAndPushed(api.getPreferences, api.onPreferences);
  const [selected, setSelected] = useState<TabId>('general');
  const baseId = useId();
  const idFor = (tab: TabId, part: 'tab' | 'panel'): string => `${baseId}-${tab}-${part}`;

  return (
    <Modal label="Settings" size="wide" onClose={onClose}>
      <header className={styles.header}>
        <h2 className={styles.title}>Settings</h2>
        <SettingsTabs tabs={TABS} selected={selected} idFor={idFor} onSelect={setSelected} />
      </header>
      <div className={styles.body}>
        <TabPanel tab="general" selected={selected} idFor={idFor}>
          <BoardFolderSection appState={appState} onAppState={onAppState} />
          <StartupSection preferences={preferences} />
          <NotificationsSection preferences={preferences} />
        </TabPanel>
        <TabPanel tab="board" selected={selected} idFor={idFor}>
          <AgeColoursSection />
        </TabPanel>
        <TabPanel tab="agent" selected={selected} idFor={idFor}>
          <AgentSection />
        </TabPanel>
        <TabPanel tab="updates" selected={selected} idFor={idFor}>
          <AppUpdatesSection />
        </TabPanel>
      </div>
      <footer className={styles.footer}>
        <Button variant="primary" shortcut="cancel" onClick={onClose}>
          Done
        </Button>
      </footer>
    </Modal>
  );
}
