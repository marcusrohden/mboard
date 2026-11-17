import type { MboardApi } from '../shared/contract';

declare global {
  interface Window {
    readonly mboard?: MboardApi;
  }
}

export {};
