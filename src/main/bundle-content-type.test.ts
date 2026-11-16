import { describe, expect, it } from 'vitest';
import { bundleContentType } from './bundle-content-type';

describe('bundleContentType', () => {
  it.each([
    ['/app.asar/.vite/renderer/main_window/index.html', 'text/html; charset=utf-8'],
    ['/app.asar/.vite/renderer/main_window/assets/index-rXrgxU18.js', 'text/javascript; charset=utf-8'],
    ['/app.asar/.vite/renderer/main_window/assets/index-DxnXbhPS.CSS', 'text/css; charset=utf-8'],
    ['/bundle/icon.svg', 'image/svg+xml'],
    ['/bundle/font.woff2', 'font/woff2'],
  ])('types %s as %s', (filePath, expected) => {
    expect(bundleContentType(filePath)).toBe(expected);
  });

  it('falls back to a generic binary type for unknown extensions', () => {
    expect(bundleContentType('/bundle/data.bin')).toBe('application/octet-stream');
  });
});
