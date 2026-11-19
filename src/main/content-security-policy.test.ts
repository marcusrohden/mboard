import { describe, expect, it } from 'vitest';
import { CSP_NONCE_PLACEHOLDER } from '../shared/csp-nonce';
import { contentSecurityPolicy, createCspNonce, withCspNonce } from './content-security-policy';

function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((entry) => entry.startsWith(`${name} `));
}

describe('contentSecurityPolicy', () => {
  it('allows only bundled styles without a nonce', () => {
    expect(directive(contentSecurityPolicy(), 'style-src')).toBe("style-src 'self'");
  });

  it('also allows style elements carrying the page nonce', () => {
    expect(directive(contentSecurityPolicy('abc123=='), 'style-src')).toBe("style-src 'self' 'nonce-abc123=='");
  });

  it('keeps scripts and every other source strict whatever the nonce', () => {
    const policy = contentSecurityPolicy('abc123==');
    expect(directive(policy, 'script-src')).toBe("script-src 'self'");
    expect(directive(policy, 'default-src')).toBe("default-src 'none'");
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'");
    expect(policy).not.toContain('unsafe-inline');
  });
});

describe('createCspNonce', () => {
  it('makes a different base64 value of 128 bits each time', () => {
    const first = createCspNonce();
    const second = createCspNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(second).not.toBe(first);
  });
});

describe('withCspNonce', () => {
  it('replaces every placeholder in the page with the nonce', () => {
    const page = `<meta property="csp-nonce" nonce="${CSP_NONCE_PLACEHOLDER}"><script nonce="${CSP_NONCE_PLACEHOLDER}"></script>`;
    expect(withCspNonce(page, 'abc123==')).toBe(
      '<meta property="csp-nonce" nonce="abc123=="><script nonce="abc123=="></script>',
    );
  });

  it('leaves a page without the placeholder unchanged', () => {
    expect(withCspNonce('<p>plain</p>', 'abc123==')).toBe('<p>plain</p>');
  });
});
