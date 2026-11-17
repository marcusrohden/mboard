import { ipcMain } from 'electron';
import { assertTrustedSender } from './trusted-sender';

/**
 * Answers one invoke channel. Arguments come straight from the renderer, so
 * handlers must validate them before use.
 */
export type InvokeHandler = (...args: unknown[]) => unknown;

/**
 * Registers an `ipcMain.handle` listener that only answers frames loaded from
 * the trusted renderer origin.
 */
export function handleTrustedInvoke(channel: string, trustedOrigin: string, handler: InvokeHandler): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedSender(channel, event.senderFrame?.origin, trustedOrigin);
    return handler(...args);
  });
}
