import { randomBytes } from 'node:crypto';
import { CSP_NONCE_PLACEHOLDER } from '../shared/csp-nonce';

const NONCE_BYTES = 16;

/** A fresh random nonce for one page load. */
export function createCspNonce(): string {
  return randomBytes(NONCE_BYTES).toString('base64');
}

/**
 * The Content Security Policy for a renderer response. Given the nonce a page was served with, it also allows
 * `<style>` elements that carry it, which is how dnd-kit injects the styles that place a dragged task.
 */
export function contentSecurityPolicy(styleNonce?: string): string {
  const styleSources = styleNonce === undefined ? "'self'" : `'self' 'nonce-${styleNonce}'`;
  return [
    "default-src 'none'",
    "script-src 'self'",
    `style-src ${styleSources}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

/** The page's HTML with every nonce placeholder replaced by `nonce`. */
export function withCspNonce(html: string, nonce: string): string {
  return html.replaceAll(CSP_NONCE_PLACEHOLDER, nonce);
}
