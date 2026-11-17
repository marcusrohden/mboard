/**
 * Requests from the app menu (Cmd+,) or the tray to open Settings. Opening shows the window and pushes
 * `openSettings`, and the request stays pending until the renderer takes it. A window that is still loading
 * may subscribe after the push, so the renderer also takes any pending request when it mounts: either way
 * Settings opens exactly once per request, and a reload doesn't open it again.
 */
export class SettingsRequests {
  private pending = false;

  constructor(
    private readonly showWindow: () => Promise<void>,
    private readonly notifyRenderer: () => void,
  ) {}

  async open(): Promise<void> {
    this.pending = true;
    await this.showWindow();
    this.notifyRenderer();
  }

  /** Whether a request is pending. Answers `true` once per request. */
  take(): boolean {
    const wasPending = this.pending;
    this.pending = false;
    return wasPending;
  }
}
