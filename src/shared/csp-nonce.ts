/**
 * What the built `index.html` holds where its Content Security Policy nonce goes. Vite writes it into the
 * `csp-nonce` meta tag and the tags it generates, and the `app://` handler swaps it for a fresh random nonce
 * on every load.
 */
export const CSP_NONCE_PLACEHOLDER = 'mboard-csp-nonce';
