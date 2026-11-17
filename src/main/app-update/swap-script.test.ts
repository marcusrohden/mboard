import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTemporaryFolder,
  listFilesRecursively,
  removeTemporaryFolder,
} from '../test-support/temporary-folder';
import { swapCommand, type SwapPlan } from './swap-script';

const RELAUNCH_RECORDER =
  '#!/bin/sh\nprintf "%s" "$1" > "$(dirname "$0")/relaunched.txt"\n';

async function makeBundle(bundle: string, marker: string): Promise<void> {
  await mkdir(path.join(bundle, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(path.join(bundle, 'Contents', 'MacOS', 'mboard'), marker);
}

function runSwap(plan: SwapPlan): Promise<number> {
  const { command, args } = swapCommand(plan);
  return new Promise((resolve) => {
    execFile(command, args, (error) =>
      resolve(error === null ? 0 : Number(error.code)),
    );
  });
}

function startProcess(seconds: number): ChildProcess {
  return spawn('/bin/sleep', [String(seconds)], { stdio: 'ignore' });
}

describe('the swap helper', () => {
  let root: string;
  let plan: SwapPlan;
  let waitedFor: ChildProcess | null;

  beforeEach(async () => {
    root = await createTemporaryFolder('mboard-swap-');
    const applications = path.join(root, 'Applications');
    const staging = path.join(root, 'T', 'mboard-app-update-0.2.0-abc');
    await makeBundle(path.join(applications, 'mboard.app'), 'old');
    await makeBundle(path.join(staging, 'unpacked', 'mboard.app'), 'new');
    await writeFile(path.join(staging, 'notes.txt'), 'staging leftovers');
    await writeFile(path.join(root, 'relaunch.sh'), RELAUNCH_RECORDER);
    await chmod(path.join(root, 'relaunch.sh'), 0o755);
    waitedFor = startProcess(0.3);
    plan = {
      processId: waitedFor.pid ?? -1,
      currentBundle: path.join(applications, 'mboard.app'),
      replacementBundle: path.join(staging, 'unpacked', 'mboard.app'),
      backupBundle: path.join(applications, '.mboard.app.app-update-backup'),
      stagingFolder: staging,
      relaunchCommand: path.join(root, 'relaunch.sh'),
      waitLimitSeconds: 10,
    };
  });

  afterEach(async () => {
    waitedFor?.kill();
    await removeTemporaryFolder(root);
  });

  async function remainingFiles(): Promise<string[]> {
    return (await listFilesRecursively(root)).filter(
      (file) => file !== 'relaunch.sh',
    );
  }

  async function relaunched(): Promise<string | null> {
    return readFile(path.join(root, 'relaunched.txt'), 'utf8').catch(
      () => null,
    );
  }

  it('waits for mboard to quit, swaps in the new bundle, removes the backup and staging, then relaunches', async () => {
    expect(await runSwap(plan)).toBe(0);

    expect(waitedFor?.exitCode).toBe(0);
    expect(
      await readFile(
        path.join(plan.currentBundle, 'Contents', 'MacOS', 'mboard'),
        'utf8',
      ),
    ).toBe('new');
    expect(await remainingFiles()).toEqual([
      'Applications/mboard.app/Contents/MacOS/mboard',
      'relaunched.txt',
    ]);
    expect(await relaunched()).toBe(plan.currentBundle);
  });

  it('puts the old bundle back when the new one cannot be moved in, and still cleans up and relaunches', async () => {
    expect(
      await runSwap({
        ...plan,
        replacementBundle: path.join(root, 'missing.app'),
      }),
    ).toBe(0);

    expect(
      await readFile(
        path.join(plan.currentBundle, 'Contents', 'MacOS', 'mboard'),
        'utf8',
      ),
    ).toBe('old');
    expect(await remainingFiles()).toEqual([
      'Applications/mboard.app/Contents/MacOS/mboard',
      'relaunched.txt',
    ]);
    expect(await relaunched()).toBe(plan.currentBundle);
  });

  it('replaces a stale backup left by an earlier attempt instead of moving the bundle into it', async () => {
    await makeBundle(plan.backupBundle, 'stale');

    expect(await runSwap(plan)).toBe(0);

    expect(
      await readFile(
        path.join(plan.currentBundle, 'Contents', 'MacOS', 'mboard'),
        'utf8',
      ),
    ).toBe('new');
    expect(await remainingFiles()).toEqual([
      'Applications/mboard.app/Contents/MacOS/mboard',
      'relaunched.txt',
    ]);
  });

  it('gives up when mboard never quits, removing staging but leaving the app alone and not relaunching', async () => {
    waitedFor?.kill();
    waitedFor = startProcess(30);

    expect(
      await runSwap({
        ...plan,
        processId: waitedFor.pid ?? -1,
        waitLimitSeconds: 1,
      }),
    ).toBe(1);

    expect(
      await readFile(
        path.join(plan.currentBundle, 'Contents', 'MacOS', 'mboard'),
        'utf8',
      ),
    ).toBe('old');
    expect(await remainingFiles()).toEqual([
      'Applications/mboard.app/Contents/MacOS/mboard',
    ]);
    expect(await relaunched()).toBeNull();
  });
});
