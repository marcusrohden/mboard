import { describe, expect, it } from 'vitest';
import { resolveBundleFilePath } from './bundle-path';

const BUNDLE_DIRECTORY = '/app/.vite/renderer/main_window';

describe('resolveBundleFilePath', () => {
  it.each([
    ['/', `${BUNDLE_DIRECTORY}/index.html`],
    ['/index.html', `${BUNDLE_DIRECTORY}/index.html`],
    ['/assets/index-abc123.js', `${BUNDLE_DIRECTORY}/assets/index-abc123.js`],
    ['/assets/my%20icon.svg', `${BUNDLE_DIRECTORY}/assets/my icon.svg`],
    ['/..notes.txt', `${BUNDLE_DIRECTORY}/..notes.txt`],
  ])('maps %s inside the bundle', (pathname, expectedFilePath) => {
    expect(resolveBundleFilePath(BUNDLE_DIRECTORY, pathname)).toBe(
      expectedFilePath,
    );
  });

  it.each([
    ['a parent directory', '/../secret.txt'],
    ['an encoded parent directory', '/%2e%2e/secret.txt'],
    ['an encoded slash escape', '/assets/..%2F..%2Fsecret.txt'],
    ['the bundle directory itself', '/assets/..'],
    ['a malformed escape', '/%E0%A4%A'],
    ['a null byte', '/index.html%00.js'],
  ])('refuses %s', (_description, pathname) => {
    expect(resolveBundleFilePath(BUNDLE_DIRECTORY, pathname)).toBeUndefined();
  });
});
