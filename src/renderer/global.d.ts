import type { MboardApi } from '../preload/bridge-contract';

declare global {
  interface Window {
    readonly mboard?: MboardApi;
  }
}

export {};
