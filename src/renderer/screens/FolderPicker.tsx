import { useState, type ReactNode } from 'react';
import type { AppState, FolderChoice, MboardApi } from '../../shared/contract';
import { useRunCommand } from '../state/use-run-command';
import { Button } from '../ui/Button';
import styles from './Screens.module.css';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'rejected'; message: string }
  | { kind: 'needsConfirmation'; path: string; message: string };

type FolderCommand = (api: MboardApi) => Promise<FolderChoice>;

interface FolderPickerProps {
  onAccepted: (state: AppState) => void;
  /** The label of the button that opens the folder picker. */
  chooseLabel?: string;
  children?: ReactNode;
}

/**
 * The "Choose folder…" control shared by the setup and unavailable screens and Settings. It shows a
 * rejection inline, and asks for confirmation when the folder doesn't look like it's inside an Obsidian vault.
 */
export function FolderPicker({ onAccepted, chooseLabel = 'Choose folder…', children }: FolderPickerProps) {
  const run = useRunCommand();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [isBusy, setIsBusy] = useState(false);

  async function resolve(command: FolderCommand): Promise<void> {
    setIsBusy(true);
    const result = await run(command);
    setIsBusy(false);
    if (!result.ok) return;
    const choice = result.value;
    switch (choice.kind) {
      case 'cancelled':
        setOutcome({ kind: 'idle' });
        break;
      case 'rejected':
        setOutcome({ kind: 'rejected', message: choice.message });
        break;
      case 'needsConfirmation':
        setOutcome({ kind: 'needsConfirmation', path: choice.path, message: choice.message });
        break;
      case 'accepted':
        setOutcome({ kind: 'idle' });
        onAccepted(choice.state);
        break;
    }
  }

  const choose = () => resolve((api) => api.chooseBoardFolder());

  return (
    <div className={styles.picker}>
      {outcome.kind === 'needsConfirmation' ? (
        <>
          <p role="alert" className={styles.message}>
            {outcome.message}
          </p>
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={isBusy}
              shortcut="confirm"
              onClick={() => resolve((api) => api.confirmBoardFolder(outcome.path))}
            >
              Use anyway
            </Button>
            <Button disabled={isBusy} shortcut="cancel" onClick={() => setOutcome({ kind: 'idle' })}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          {outcome.kind === 'rejected' && (
            <p role="alert" className={styles.error}>
              {outcome.message}
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="primary" disabled={isBusy} shortcut="chooseFolder" onClick={choose}>
              {chooseLabel}
            </Button>
            {children}
          </div>
        </>
      )}
    </div>
  );
}
