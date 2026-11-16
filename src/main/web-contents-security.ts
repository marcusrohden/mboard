import type { Session, WebContents } from 'electron';

/**
 * Stops a web contents from navigating away, opening new windows or attaching
 * webviews. Applied to every web contents the app creates.
 */
export function hardenWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
