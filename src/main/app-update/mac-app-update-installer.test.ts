import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTemporaryFolder, listFilesRecursively, removeTemporaryFolder } from '../test-support/temporary-folder';
import type { ReleaseDownload } from './adapters';
import type { Fetch } from './github-release-source';
import {
  createMacAppUpdateInstaller,
  type CommandRunner,
  type MacAppUpdateInstallerOptions,
} from './mac-app-update-installer';

const ZIP_BYTES = Buffer.from('pretend this is a zip of mboard.app');
const ignoreProgress = (): void => undefined;
const BUNDLE_ID = 'com.electron.mboard';

function digestOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function download(changes: Partial<ReleaseDownload> = {}): ReleaseDownload {
  return {
    fileName: 'mboard-darwin-arm64-0.2.0.zip',
    url: 'https://github.com/marcusrohden/mboard/releases/download/v0.2.0/mboard-darwin-arm64-0.2.0.zip',
    size: ZIP_BYTES.byteLength,
    sha256: digestOf(ZIP_BYTES),
    ...changes,
  };
}

interface FakeTools {
  run: CommandRunner;
  calls: string[];
  plist: Map<string, string>;
  failing: Set<string>;
}

/**
 * Stands in for the macOS tools: `ditto` unpacks a bundle folder, PlistBuddy answers from `plist`, and
 * any tool named in `failing` exits with an error.
 */
function fakeTools(): FakeTools {
  const calls: string[] = [];
  const plist = new Map<string, string>();
  const failing = new Set<string>();
  const run: CommandRunner = async (command, args) => {
    const tool = path.basename(command);
    calls.push(tool);
    if (failing.has(tool)) throw new Error(`${tool} failed`);
    if (tool === 'ditto') {
      await mkdir(path.join(args[3]!, 'mboard.app', 'Contents'), {
        recursive: true,
      });
      return '';
    }
    if (tool === 'PlistBuddy') {
      const bundle = path.dirname(path.dirname(args[2]!));
      const key = args[1]!.replace('Print :', '');
      return `${plist.get(`${path.basename(path.dirname(bundle))}|${key}`) ?? ''}\n`;
    }
    return '';
  };
  return { run, calls, plist, failing };
}

describe('createMacAppUpdateInstaller', () => {
  let root: string;
  let tempFolder: string;
  let tools: FakeTools;
  let spawned: Array<{ command: string; args: readonly string[] }>;
  let fetchBody: () => Response;
  let errors: unknown[];

  beforeEach(async () => {
    root = await createTemporaryFolder('mboard-installer-');
    tempFolder = path.join(root, 'T');
    await mkdir(tempFolder);
    await mkdir(path.join(root, 'Applications', 'mboard.app', 'Contents', 'MacOS'), { recursive: true });
    tools = fakeTools();
    tools.plist.set(`Applications|CFBundleIdentifier`, BUNDLE_ID);
    tools.plist.set(`unpacked|CFBundleIdentifier`, BUNDLE_ID);
    tools.plist.set(`unpacked|CFBundleShortVersionString`, '0.2.0');
    spawned = [];
    errors = [];
    fetchBody = () => new Response(ZIP_BYTES);
  });

  afterEach(async () => {
    await chmod(path.join(root, 'Applications'), 0o755).catch(() => undefined);
    await removeTemporaryFolder(root);
  });

  function installer(changes: Partial<MacAppUpdateInstallerOptions> = {}) {
    const fetch: Fetch = vi.fn(async () => fetchBody());
    return createMacAppUpdateInstaller({
      fetch,
      runningCopy: {
        isPackaged: true,
        executablePath: path.join(root, 'Applications', 'mboard.app', 'Contents', 'MacOS', 'mboard'),
      },
      tempFolder,
      processId: 4242,
      run: tools.run,
      spawnDetached: async (command, args) => {
        spawned.push({ command, args });
      },
      reportError: (error) => errors.push(error),
      ...changes,
    });
  }

  async function tempEntries(): Promise<string[]> {
    return readdir(tempFolder);
  }

  describe('prepare', () => {
    it('downloads, checks, unpacks and deletes the zip, keeping only the unpacked app', async () => {
      const prepared = await installer().prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress);

      expect(prepared.version).toBe('0.2.0');
      expect(path.dirname(prepared.stagingFolder)).toBe(tempFolder);
      expect(path.basename(prepared.stagingFolder)).toMatch(/^mboard-app-update-0\.2\.0-/);
      expect(prepared.bundlePath).toBe(path.join(prepared.stagingFolder, 'unpacked', 'mboard.app'));
      expect(await readdir(prepared.stagingFolder)).toEqual(['unpacked']);
      expect(tools.calls).toEqual(['ditto', 'PlistBuddy', 'PlistBuddy', 'PlistBuddy', 'xattr']);
    });

    it('reports the bytes received so far after each chunk it writes', async () => {
      fetchBody = () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(ZIP_BYTES.subarray(0, 10));
              controller.enqueue(ZIP_BYTES.subarray(10, 20));
              controller.enqueue(ZIP_BYTES.subarray(20));
              controller.close();
            },
          }),
        );
      const received: number[] = [];
      await installer().prepare(download(), '0.2.0', new AbortController().signal, (bytes) => received.push(bytes));
      expect(received).toEqual([10, 20, ZIP_BYTES.byteLength]);
    });

    it('still succeeds when the quarantine flag cannot be removed', async () => {
      tools.failing.add('xattr');
      await expect(
        installer().prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress),
      ).resolves.toBeTruthy();
    });

    it.each([
      [
        'the digest differs',
        () => download({ sha256: digestOf(Buffer.from('something else')) }),
        /didn't match the release/,
      ],
      [
        'the file is shorter than the release says',
        () => download({ size: ZIP_BYTES.byteLength + 1 }),
        /didn't match the release/,
      ],
      [
        'the file is longer than the release says',
        () => download({ size: ZIP_BYTES.byteLength - 1 }),
        /didn't match the release/,
      ],
    ])('removes everything and refuses when %s', async (_description, makeDownload, message) => {
      await expect(
        installer().prepare(makeDownload(), '0.2.0', new AbortController().signal, ignoreProgress),
      ).rejects.toThrow(message);
      expect(await tempEntries()).toEqual([]);
      expect(tools.calls).toEqual([]);
    });

    it('removes everything when GitHub answers with an error', async () => {
      fetchBody = () => new Response('Not Found', { status: 404 });
      await expect(
        installer().prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress),
      ).rejects.toThrow("GitHub couldn't send the new version (HTTP 404). Try again later.");
      expect(await tempEntries()).toEqual([]);
    });

    it('removes everything when the network fails', async () => {
      const fetch: Fetch = async () => {
        throw new TypeError('net::ERR_CONNECTION_RESET');
      };
      await expect(
        installer({ fetch }).prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress),
      ).rejects.toThrow("mboard couldn't download the new version. Check your internet connection and try again.");
      expect(await tempEntries()).toEqual([]);
      expect(errors).toHaveLength(1);
    });

    it.each([
      ['ditto', "mboard couldn't unpack the new version."],
      ['PlistBuddy', "mboard couldn't check the new version, so it didn't install it."],
    ])('removes the zip and everything else when %s fails', async (tool, message) => {
      tools.failing.add(tool);
      await expect(
        installer().prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress),
      ).rejects.toThrow(message);
      expect(await tempEntries()).toEqual([]);
    });

    it.each([
      ['another app', 'unpacked|CFBundleIdentifier', 'com.example.other'],
      ['another version', 'unpacked|CFBundleShortVersionString', '0.1.9'],
    ])('removes everything and refuses a bundle that is %s', async (_description, key, value) => {
      tools.plist.set(key, value);
      await expect(
        installer().prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress),
      ).rejects.toThrow("The download isn't mboard 0.2.0, so mboard didn't install it.");
      expect(await tempEntries()).toEqual([]);
      expect(tools.calls).not.toContain('xattr');
    });

    it('removes everything when the zip holds no app', async () => {
      const run: CommandRunner = async (command, args) => {
        if (path.basename(command) === 'ditto') await writeFile(path.join(args[3]!, 'README.txt'), 'no app here');
        return '';
      };
      await expect(
        installer({ run }).prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress),
      ).rejects.toThrow("The download didn't contain the mboard app, so mboard didn't install it.");
      expect(await tempEntries()).toEqual([]);
    });

    it('removes everything when the download is stopped', async () => {
      const controller = new AbortController();
      const run: CommandRunner = async (command, args) => {
        controller.abort();
        return tools.run(command, args);
      };
      await expect(installer({ run }).prepare(download(), '0.2.0', controller.signal, ignoreProgress)).rejects.toThrow(
        'The download stopped before it finished.',
      );
      expect(await tempEntries()).toEqual([]);
    });
  });

  describe('launchSwap', () => {
    it('starts the swap helper for the running bundle and leaves staging to it', async () => {
      const prepared = await installer().prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress);
      await installer().launchSwap(prepared);

      const currentBundle = path.join(root, 'Applications', 'mboard.app');
      expect(spawned).toHaveLength(1);
      expect(spawned[0]!.command).toBe('/bin/sh');
      expect(spawned[0]!.args.slice(3)).toEqual([
        '4242',
        currentBundle,
        prepared.bundlePath,
        path.join(root, 'Applications', '.mboard.app.app-update-backup'),
        prepared.stagingFolder,
        '/usr/bin/open',
        '60',
      ]);
      expect(await tempEntries()).toEqual([path.basename(prepared.stagingFolder)]);
    });

    it('removes staging when the helper cannot start', async () => {
      const prepared = await installer().prepare(download(), '0.2.0', new AbortController().signal, ignoreProgress);
      const failingSpawn = async () => {
        throw new Error('spawn /bin/sh EAGAIN');
      };
      await expect(installer({ spawnDetached: failingSpawn }).launchSwap(prepared)).rejects.toThrow(
        "mboard couldn't start installing the new version.",
      );
      expect(await tempEntries()).toEqual([]);
    });

    it('refuses a staging folder outside the temp folder', async () => {
      const outside = path.join(root, 'elsewhere');
      await mkdir(outside);
      await expect(
        installer().launchSwap({
          version: '0.2.0',
          bundlePath: path.join(outside, 'mboard.app'),
          stagingFolder: outside,
        }),
      ).rejects.toThrow("mboard couldn't start installing the new version.");
      expect(spawned).toEqual([]);
    });
  });

  describe('installBlocker', () => {
    it('allows a packaged bundle in a writable folder', async () => {
      await expect(installer().installBlocker()).resolves.toBeNull();
    });

    it('explains a copy running from source', async () => {
      const runningCopy = {
        isPackaged: false,
        executablePath: '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      };
      await expect(installer({ runningCopy }).installBlocker()).resolves.toMatch(/running from source/);
    });

    it('explains a folder it cannot write to', async () => {
      await chmod(path.join(root, 'Applications'), 0o555);
      await expect(installer().installBlocker()).resolves.toBe(
        `mboard can't replace itself in ${path.join(root, 'Applications')}, because it isn't allowed to change that folder.`,
      );
    });
  });

  describe('removeLeftovers', () => {
    it('removes staging folders and a backup bundle left by an unfinished run, and nothing else', async () => {
      await mkdir(path.join(tempFolder, 'mboard-app-update-0.2.0-abc', 'unpacked'), { recursive: true });
      await writeFile(path.join(tempFolder, 'mboard-app-update-0.2.0-abc', 'mboard-darwin-arm64-0.2.0.zip'), ZIP_BYTES);
      await mkdir(path.join(tempFolder, 'mboard-app-update-0.3.0-def'));
      await mkdir(path.join(tempFolder, 'someone-elses-folder'));
      await mkdir(path.join(root, 'Applications', '.mboard.app.app-update-backup', 'Contents'), { recursive: true });
      await writeFile(path.join(root, 'Applications', 'mboard.app', 'Contents', 'MacOS', 'mboard'), 'running');

      await installer().removeLeftovers();

      expect(await tempEntries()).toEqual(['someone-elses-folder']);
      expect(await listFilesRecursively(path.join(root, 'Applications'))).toEqual(['mboard.app/Contents/MacOS/mboard']);
    });

    it('copes with a temp folder that does not exist', async () => {
      await expect(installer({ tempFolder: path.join(root, 'missing') }).removeLeftovers()).resolves.toBeUndefined();
    });
  });
});
