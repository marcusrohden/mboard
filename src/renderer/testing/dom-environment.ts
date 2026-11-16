import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * Registers the hooks every component test file needs: jsdom gaps that the UI and dnd-kit rely on are
 * filled in, and the rendered tree is unmounted after each test because Testing Library's automatic
 * cleanup needs vitest globals, which this project doesn't enable. Call it once at the top of a test file.
 */
export function useDomEnvironment(): void {
  beforeEach(() => {
    globalThis.ResizeObserver ??= ResizeObserverStub;
    Element.prototype.scrollIntoView ??= () => undefined;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
  });
  afterEach(() => {
    cleanup();
    delete (window as { mboard?: unknown }).mboard;
  });
}
