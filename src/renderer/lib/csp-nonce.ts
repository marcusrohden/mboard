const CSP_NONCE_SELECTOR = 'meta[property="csp-nonce"]';

/**
 * The nonce the page was served with, read from its `csp-nonce` meta tag. Libraries that inject `<style>`
 * elements need it to get past the Content Security Policy. `undefined` when the page has none.
 */
export function readCspNonce(root: ParentNode = document): string | undefined {
  const meta = root.querySelector<HTMLMetaElement>(CSP_NONCE_SELECTOR);
  const nonce = meta?.nonce || meta?.getAttribute('nonce');
  return nonce ? nonce : undefined;
}
