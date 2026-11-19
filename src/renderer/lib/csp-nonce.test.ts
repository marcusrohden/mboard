/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readCspNonce } from './csp-nonce';

function pageWith(head: string): Document {
  return new DOMParser().parseFromString(`<html><head>${head}</head><body></body></html>`, 'text/html');
}

describe('readCspNonce', () => {
  it('reads the nonce from the csp-nonce meta tag', () => {
    expect(readCspNonce(pageWith('<meta property="csp-nonce" nonce="abc123==">'))).toBe('abc123==');
  });

  it('is undefined when the page has no csp-nonce meta tag', () => {
    expect(readCspNonce(pageWith('<meta charset="utf-8">'))).toBeUndefined();
  });

  it('is undefined when the meta tag carries no nonce', () => {
    expect(readCspNonce(pageWith('<meta property="csp-nonce">'))).toBeUndefined();
  });
});
