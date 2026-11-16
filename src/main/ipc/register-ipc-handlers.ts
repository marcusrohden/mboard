import type { AppState } from '../../shared/contract';
import { IPC } from '../../shared/contract';
import { handleTrustedInvoke } from './handle-trusted-invoke';

const PLACEHOLDER_STATE: AppState = { kind: 'needsSetup' };

/**
 * Registers every IPC handler the renderer can invoke through `window.mboard`. Placeholder until the
 * board backend wires the services from `ports.ts`.
 */
export function registerIpcHandlers(trustedOrigin: string): void {
  handleTrustedInvoke(IPC.invoke.getAppState, trustedOrigin, () => PLACEHOLDER_STATE);
}
