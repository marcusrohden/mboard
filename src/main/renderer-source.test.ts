import { describe, expect, it } from 'vitest';
import { resolveRendererSource } from './renderer-source';

const BUNDLE_DIRECTORY = '/app/.vite/renderer/main_window';

describe('resolveRendererSource', () => {
  it('loads from the dev server and trusts only its origin when Forge provides a URL', () => {
    expect(resolveRendererSource('http://localhost:5173/', BUNDLE_DIRECTORY)).toEqual({
      kind: 'dev-server',
      entryUrl: 'http://localhost:5173/',
      trustedOrigin: 'http://localhost:5173',
    });
  });

  it('serves the built bundle over app://bundle when there is no dev server', () => {
    expect(resolveRendererSource(undefined, BUNDLE_DIRECTORY)).toEqual({
      kind: 'bundle',
      entryUrl: 'app://bundle/index.html',
      trustedOrigin: 'app://bundle',
      bundleDirectory: BUNDLE_DIRECTORY,
    });
  });
});
