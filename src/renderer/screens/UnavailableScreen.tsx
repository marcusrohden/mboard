import type { AppState, UnavailableReason } from '../../shared/contract';
import { useRunCommand } from '../state/use-run-command';
import { Button } from '../ui/Button';
import { FolderPicker } from './FolderPicker';
import styles from './Screens.module.css';

const REASON_TEXT: Record<UnavailableReason, string> = {
  notFound: "This folder doesn't exist any more. It may have been moved, renamed or deleted.",
  permissionDenied: "mboard doesn't have permission to read this folder.",
  notADirectory: "This path isn't a folder.",
};

interface UnavailableScreenProps {
  path: string;
  reason: UnavailableReason;
  onState: (state: AppState) => void;
}

/**
 * Shown when the saved board folder can't be opened. Offers to try again or to choose another folder.
 */
export function UnavailableScreen({ path, reason, onState }: UnavailableScreenProps) {
  const run = useRunCommand();

  async function retry(): Promise<void> {
    const result = await run((api) => api.retryOpenBoard());
    if (result.ok) onState(result.value);
  }

  return (
    <main className={styles.screen}>
      <h1 className={styles.heading}>Can't open your board</h1>
      <p className={styles.explanation}>
        <code className={styles.path}>{path}</code>
      </p>
      <p className={styles.explanation}>{REASON_TEXT[reason]}</p>
      <FolderPicker onAccepted={onState}>
        <Button shortcut="tryAgain" onClick={retry}>
          Try again
        </Button>
      </FolderPicker>
    </main>
  );
}
