import path from 'node:path';

const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * The `Content-Type` for a file in the renderer bundle, chosen by its extension. Responses are sent with
 * `nosniff`, so module scripts load only when this is exact, whatever `net.fetch` reports for files
 * inside `app.asar`.
 */
export function bundleContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? FALLBACK_CONTENT_TYPE;
}
