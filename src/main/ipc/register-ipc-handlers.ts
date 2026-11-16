import { IpcChannel } from '../../preload/bridge-contract';
import { handleTrustedInvoke } from './handle-trusted-invoke';

const PING_REPLY = 'pong';

/**
 * Registers every IPC handler the renderer can invoke through `window.mboard`.
 */
export function registerIpcHandlers(trustedOrigin: string): void {
  handleTrustedInvoke(IpcChannel.ping, trustedOrigin, replyToPing);
}

function replyToPing(): string {
  return PING_REPLY;
}
