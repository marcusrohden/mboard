import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { hardenWebContents } from './web-contents-security';

const DEV_SERVER_ORIGIN = 'http://localhost:5173';
const BUNDLE_ORIGIN = 'app://bundle';

function hardenedContents(trustedOrigin: string) {
  const contents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: vi.fn(),
  });
  hardenWebContents(contents as unknown as WebContents, trustedOrigin);
  return contents;
}

function isBlocked(
  contents: EventEmitter,
  eventName: string,
  url?: string,
): boolean {
  const event = { url, preventDefault: vi.fn() };
  contents.emit(eventName, event, url);
  return event.preventDefault.mock.calls.length > 0;
}

describe('hardenWebContents', () => {
  it.each([
    [DEV_SERVER_ORIGIN, 'http://localhost:5173/'],
    [BUNDLE_ORIGIN, 'app://bundle/index.html'],
  ])(
    'lets the %s renderer reload its own page, as the dev server and the error screen do',
    (origin, url) => {
      expect(isBlocked(hardenedContents(origin), 'will-navigate', url)).toBe(
        false,
      );
    },
  );

  it('lets the renderer navigate within its own origin', () => {
    const contents = hardenedContents(DEV_SERVER_ORIGIN);

    expect(
      isBlocked(
        contents,
        'will-navigate',
        'http://localhost:5173/index.html?reload=1',
      ),
    ).toBe(false);
  });

  it.each([
    [DEV_SERVER_ORIGIN, 'https://example.com/'],
    [DEV_SERVER_ORIGIN, 'http://localhost:5174/'],
    [DEV_SERVER_ORIGIN, 'https://localhost:5173/'],
    [DEV_SERVER_ORIGIN, 'app://bundle/index.html'],
    [BUNDLE_ORIGIN, 'app://elsewhere/index.html'],
    [BUNDLE_ORIGIN, 'file:///etc/hosts'],
    [BUNDLE_ORIGIN, 'obsidian://open?path=%2Fvault'],
  ])('keeps the %s renderer from navigating to %s', (origin, url) => {
    expect(isBlocked(hardenedContents(origin), 'will-navigate', url)).toBe(
      true,
    );
  });

  it('blocks a navigation whose URL cannot be parsed', () => {
    expect(
      isBlocked(hardenedContents(BUNDLE_ORIGIN), 'will-navigate', 'not a url'),
    ).toBe(true);
  });

  it('blocks webviews and denies every new window', () => {
    const contents = hardenedContents(BUNDLE_ORIGIN);

    expect(isBlocked(contents, 'will-attach-webview')).toBe(true);
    const openHandler = contents.setWindowOpenHandler.mock
      .calls[0]?.[0] as () => unknown;
    expect(openHandler()).toEqual({ action: 'deny' });
  });
});
