export const APP_SCHEME = 'app';
export const APP_BUNDLE_HOST = 'bundle';
export const APP_BUNDLE_ORIGIN = `${APP_SCHEME}://${APP_BUNDLE_HOST}`;

/**
 * Where the renderer is loaded from, and the only origin main trusts for IPC.
 * `dev-server` is used by `pnpm start`; `bundle` serves the built renderer over
 * `app://bundle` for packaged builds and end-to-end tests.
 */
export type RendererSource =
  | {
      readonly kind: 'dev-server';
      readonly entryUrl: string;
      readonly trustedOrigin: string;
    }
  | {
      readonly kind: 'bundle';
      readonly entryUrl: string;
      readonly trustedOrigin: string;
      readonly bundleDirectory: string;
    };

/**
 * Chooses the renderer source. Forge only defines a dev-server URL during
 * `electron-forge start`, so its presence (not `app.isPackaged`) is the switch.
 */
export function resolveRendererSource(devServerUrl: string | undefined, bundleDirectory: string): RendererSource {
  if (devServerUrl) {
    return {
      kind: 'dev-server',
      entryUrl: devServerUrl,
      trustedOrigin: new URL(devServerUrl).origin,
    };
  }
  return {
    kind: 'bundle',
    entryUrl: `${APP_BUNDLE_ORIGIN}/index.html`,
    trustedOrigin: APP_BUNDLE_ORIGIN,
    bundleDirectory,
  };
}
