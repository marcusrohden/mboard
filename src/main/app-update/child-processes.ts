import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  CommandRunner,
  DetachedSpawner,
} from './mac-app-update-installer';

const execFileAsync = promisify(execFile);

/** Runs a command with `execFile`, without a shell, and resolves with its standard output. */
export const runCommand: CommandRunner = async (command, args) =>
  (await execFileAsync(command, [...args])).stdout;

/**
 * Starts a command in its own process group with no inherited input or output, so it keeps running after
 * mboard quits. Resolves once the process has started.
 */
export const spawnDetached: DetachedSpawner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
