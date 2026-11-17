import type { AppState } from '../../shared/contract';
import { FolderPicker } from './FolderPicker';
import styles from './Screens.module.css';

interface SetupScreenProps {
  onState: (state: AppState) => void;
}

/**
 * First run: explains what the board folder is and lets the person choose one.
 */
export function SetupScreen({ onState }: SetupScreenProps) {
  return (
    <main className={styles.screen}>
      <h1 className={styles.heading}>Choose your board folder</h1>
      <p className={styles.explanation}>
        mboard keeps every task as a markdown file in a folder of your choice. Pick an empty folder, or an existing
        mboard board, ideally inside your Obsidian vault so that you can read and edit the tasks there too.
      </p>
      <FolderPicker onAccepted={onState} />
    </main>
  );
}
