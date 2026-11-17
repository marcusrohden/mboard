import type { Session, WebContents } from 'electron';

/**
 * Stops a web contents from navigating away from the renderer's origin,
 * opening new windows or attaching webviews. Navigation within
 * `trustedOrigin` stays allowed: a blocked reload leaves the page half-loaded
 * and blank, and both the dev server and the error screen reload the page.
 * Applied to every web contents the app creates.
 */
export function hardenWebContents(
  contents: WebContents,
  trustedOrigin: string,
): void {
  contents.on('will-navigate', (event) => {
    if (!isWithinOrigin(event.url, trustedOrigin)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/**
 * Compares scheme and host rather than `URL.origin`, which Node reports as
 * `"null"` for custom schemes such as `app://`.
 */
function isWithinOrigin(url: string, origin: string): boolean {
  if (!URL.canParse(url)) return false;
  const { protocol, host } = new URL(url);
  return `${protocol}//${host}` === origin;
}

/**
 * Denies every permission request (camera, notifications, geolocation and so
 * on) raised by web content. Native features run in the main process instead.
 */
export function denyPermissionRequests(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, respond) =>
    respond(false),
  );
}
