import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { bundleContentType } from './bundle-content-type';
import { resolveBundleFilePath } from './bundle-path';
import { contentSecurityPolicy, createCspNonce, withCspNonce } from './content-security-policy';
import { APP_BUNDLE_HOST, APP_SCHEME } from './renderer-source';

const HTML_CONTENT_TYPE = 'text/html';

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
 * a strict Content Security Policy to every response. Each HTML page gets a
 * fresh nonce, written into the page and allowed for its `<style>` elements.
 */
export function serveRendererBundle(bundleDirectory: string): void {
  protocol.handle(APP_SCHEME, (request) => respondWithBundleFile(request.url, bundleDirectory));
}

async function respondWithBundleFile(requestUrl: string, bundleDirectory: string): Promise<Response> {
  const { host, pathname } = new URL(requestUrl);
  const filePath = host === APP_BUNDLE_HOST ? resolveBundleFilePath(bundleDirectory, pathname) : undefined;
  if (filePath === undefined) {
    return notFound();
  }
  try {
    const fileResponse = await net.fetch(pathToFileURL(filePath).toString());
    const contentType = bundleContentType(filePath);
    if (contentType.startsWith(HTML_CONTENT_TYPE)) {
      return await withNoncedPage(fileResponse, contentType);
    }
    return withSecurityHeaders(fileResponse, contentType, contentSecurityPolicy());
  } catch {
    return notFound();
  }
}

async function withNoncedPage(response: Response, contentType: string): Promise<Response> {
  const nonce = createCspNonce();
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  const page = new Response(withCspNonce(await response.text(), nonce), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return withSecurityHeaders(page, contentType, contentSecurityPolicy(nonce));
}

function withSecurityHeaders(response: Response, contentType: string, policy: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', contentType);
  headers.set('Content-Security-Policy', policy);
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
