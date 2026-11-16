import { describe, expect, it } from 'vitest';
import { assertTrustedSender, UntrustedSenderError } from './trusted-sender';

const TRUSTED_ORIGIN = 'app://bundle';

describe('assertTrustedSender', () => {
  it('accepts a frame on the trusted origin', () => {
    expect(() =>
      assertTrustedSender('board:getSnapshot', TRUSTED_ORIGIN, TRUSTED_ORIGIN),
    ).not.toThrow();
  });

  it.each([
    ['a missing frame', undefined],
    ['another origin', 'https://example.com'],
    ['a look-alike origin', 'app://bundle.example'],
    ['an opaque origin', 'null'],
  ])('refuses %s', (_description, senderOrigin) => {
    expect(() =>
      assertTrustedSender('board:getSnapshot', senderOrigin, TRUSTED_ORIGIN),
    ).toThrow(UntrustedSenderError);
  });
});
