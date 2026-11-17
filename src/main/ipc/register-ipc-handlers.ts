import { IPC, type InvokeMethod } from '../../shared/contract';
import { handleTrustedInvoke } from './handle-trusted-invoke';
import type { InvokeHandlers } from './invoke-handlers';

/**
 * Registers a handler for every invoke channel in the contract, each answering only the trusted renderer
 * origin.
 */
export function registerIpcHandlers(trustedOrigin: string, handlers: InvokeHandlers): void {
  for (const method of Object.keys(IPC.invoke) as InvokeMethod[]) {
    handleTrustedInvoke(IPC.invoke[method], trustedOrigin, handlers[method]);
  }
}
