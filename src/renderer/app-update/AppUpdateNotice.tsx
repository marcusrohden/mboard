import type { AppUpdateStage } from '../../shared/contract';
import noticeStyles from '../notices/Notices.module.css';
import { Button } from '../ui/Button';
import { appUpdateStageText, canInstallItself, stageVersion } from './app-update-text';
import { useAppUpdate } from './AppUpdateProvider';
import styles from './AppUpdateNotice.module.css';

type NoticeAction = 'install' | 'releaseNotes' | 'download' | 'later';

interface Notice {
  text: string;
  actions: NoticeAction[];
}

function noticeFor(stage: AppUpdateStage, dismissedVersion: string | null): Notice | null {
  const version = stageVersion(stage);
  switch (stage.kind) {
    case 'available':
      if (version === dismissedVersion) return null;
      return {
        text: appUpdateStageText(stage),
        actions: canInstallItself(stage) ? ['install', 'releaseNotes', 'later'] : ['download', 'later'],
      };
    case 'downloading':
    case 'installing':
      return { text: appUpdateStageText(stage), actions: [] };
    case 'failed':
      if (version === null || version === dismissedVersion) return null;
      return { text: stage.message, actions: ['download', 'later'] };
    default:
      return null;
  }
}

/**
 * The app-wide prompt for a new version of mboard: install it and restart, read the release notes, or put
 * it off with Later until the next launch or a newer version. It also shows the download and install
 * while they run, and an install that failed. Renders nothing otherwise.
 */
export function AppUpdateNotice() {
  const { status, install, openReleasePage, dismissedVersion, dismiss } = useAppUpdate();
  const notice = status === null ? null : noticeFor(status.stage, dismissedVersion);
  if (status === null || notice === null) return null;
  const version = stageVersion(status.stage);

  return (
    <section aria-label="New version of mboard" className={`${noticeStyles.notice} ${styles.appUpdate}`}>
      <div className={noticeStyles.noticeRow}>
        <strong role="status">{notice.text}</strong>
        <div className={styles.actions}>
          {notice.actions.includes('install') && (
            <Button variant="primary" shortcut="installUpdate" onClick={install}>
              Install and restart
            </Button>
          )}
          {notice.actions.includes('download') && (
            <Button shortcut="downloadUpdate" onClick={openReleasePage}>
              Download from GitHub
            </Button>
          )}
          {notice.actions.includes('releaseNotes') && (
            <Button shortcut="releaseNotes" onClick={openReleasePage}>
              Release notes
            </Button>
          )}
          {notice.actions.includes('later') && version !== null && (
            <Button variant="quiet" shortcut="dismissUpdate" onClick={() => dismiss(version)}>
              Later
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
