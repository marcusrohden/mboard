import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const electronCacheRoot = process.env['electron_config_cache'];
const runFile = promisify(execFile);
const CODESIGN = '/usr/bin/codesign';

async function appBundlesIn(outputPath: string): Promise<string[]> {
  const entries = await readdir(outputPath);
  return entries.filter((entry) => entry.endsWith('.app')).map((entry) => path.join(outputPath, entry));
}

/**
 * Re-signs each packaged app ad hoc, after packaging has finished changing its files, and checks that the
 * whole bundle then verifies. Packaging edits `Info.plist` after Electron's own ad-hoc signature was made,
 * so without this the top-level signature never verifies and a quarantined download reads as damaged
 * (ADR 0004).
 *
 * @throws Error when no app bundle is found or `codesign` fails, which stops the build.
 */
async function adHocSignPackagedApps(outputPaths: readonly string[]): Promise<void> {
  const bundles = (await Promise.all(outputPaths.map(appBundlesIn))).flat();
  if (bundles.length === 0) throw new Error(`No .app bundle to sign in ${outputPaths.join(', ')}.`);
  for (const bundle of bundles) {
    await runFile(CODESIGN, ['--force', '--deep', '--sign', '-', bundle]);
    await runFile(CODESIGN, ['--verify', '--deep', '--strict', bundle]);
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    ...(electronCacheRoot ? { download: { cacheRoot: electronCacheRoot } } : {}),
  },
  rebuildConfig: {},
  hooks: {
    postPackage: async (_forgeConfig, { platform, outputPaths }) => {
      if (platform === 'darwin') await adHocSignPackagedApps(outputPaths);
    },
  },
  makers: [new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: { main: 'src/main/index.ts' },
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: { preload: 'src/preload/index.ts' },
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
