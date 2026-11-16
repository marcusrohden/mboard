import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { bundleContentType } from './bundle-content-type';
import { resolveBundleFilePath } from './bundle-path';
import { APP_BUNDLE_HOST, APP_SCHEME } from './renderer-source';

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

/**
 * Registers `app://` as a standard, secure scheme. Electron requires this
 * before the app is ready.
 */
export function registerAppSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/**
 * Serves the built renderer from `bundleDirectory` at `app://bundle/`, adding
 * a strict Content Security Policy to every response.
 */
export function serveRendererBundle(bundleDirectory: string): void {
  protocol.handle(APP_SCHEME, (request) =>
    respondWithBundleFile(request.url, bundleDirectory),
  );
}

async function respondWithBundleFile(
  requestUrl: string,
  bundleDirectory: string,
): Promise<Response> {
  const { host, pathname } = new URL(requestUrl);
  const filePath =
    host === APP_BUNDLE_HOST
      ? resolveBundleFilePath(bundleDirectory, pathname)
      : undefined;
  if (filePath === undefined) {
    return notFound();
  }
  try {
    const fileResponse = await net.fetch(pathToFileURL(filePath).toString());
    return withSecurityHeaders(fileResponse, bundleContentType(filePath));
  } catch {
    return notFound();
  }
}

function withSecurityHeaders(response: Response, contentType: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', contentType);
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
