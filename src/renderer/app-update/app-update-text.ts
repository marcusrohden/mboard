import type { AppUpdateStage } from '../../shared/contract';
import { formatDateTime } from '../lib/format';

/** One line saying where an app update has got to, as Settings shows it. */
export function appUpdateStageText(stage: AppUpdateStage): string {
  switch (stage.kind) {
    case 'idle':
      return "mboard hasn't checked for a new version yet.";
    case 'checking':
      return 'Checking for a new version…';
    case 'upToDate':
      return `mboard is up to date. Last checked ${formatDateTime(stage.checkedAt)}.`;
    case 'available':
      return `mboard ${stage.version} is available.`;
    case 'downloading':
      return `Downloading mboard ${stage.version}…`;
    case 'installing':
      return `Installing mboard ${stage.version}. mboard will restart in a moment.`;
    case 'failed':
      return stage.message;
  }
}

/** Whether a check, download or install is running, so another one can't start. */
export function isAppUpdateBusy(stage: AppUpdateStage): boolean {
  return stage.kind === 'checking' || stage.kind === 'downloading' || stage.kind === 'installing';
}

/** The new version the stage is about, or `null` when it isn't about one. */
export function stageVersion(stage: AppUpdateStage): string | null {
  switch (stage.kind) {
    case 'available':
    case 'downloading':
    case 'installing':
    case 'failed':
      return stage.version;
    default:
      return null;
  }
}

/** Whether this copy can install the available version itself, rather than offering the download page. */
export function canInstallItself(stage: AppUpdateStage): boolean {
  return stage.kind === 'available' && stage.installBlocker === null;
}
