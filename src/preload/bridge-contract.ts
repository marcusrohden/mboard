/**
 * IPC channels that the preload bridge invokes and the main process handles.
 */
export const IpcChannel = {
  ping: 'mboard:ping',
} as const;

/**
 * The API the preload script exposes to the renderer as `window.mboard`.
 */
export interface MboardApi {
  /**
   * Round-trips to the main process and resolves with its reply, proving the bridge works.
   */
  ping(): Promise<string>;
}
