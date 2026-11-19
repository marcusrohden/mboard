# 12. A per-load CSP nonce lets dnd-kit's injected styles through

- Status: accepted (chosen by the user, 2026-11-19)

## Context

The renderer is served from `app://bundle/` with a strict Content Security Policy, including `style-src 'self'`, so only bundled stylesheets apply. dnd-kit places a dragged task with rules it injects at runtime as a `<style>` element in `<head>`. The policy blocked that element. The dragged task fell back to the browser's default popover style, centred in the window, and never followed the pointer. Its cursor and text-selection rules were blocked too. The Vite dev server sends no policy, so the fault only showed in the packaged app.

Three ways out were weighed:

- **`'unsafe-inline'` for styles:** a one-word change. The other directives leave injected CSS no way to send data out, but the policy would allow any inline style from then on.
- **Copying dnd-kit's rules into a bundled stylesheet:** no policy change, but it copies library internals that can change on any upgrade and break dragging the same silent way. dnd-kit would still try to inject its element and log a violation on every drag.
- **A nonce per page load:** keeps the policy strict and allows only the `<style>` elements that carry the nonce.

## Decision

- Vite builds `index.html` with `html.cspNonce` set to a fixed placeholder (`src/shared/csp-nonce.ts`). It writes the placeholder into a `<meta property="csp-nonce">` tag and into the tags it generates.
- For every HTML page it serves, the `app://` handler makes a fresh 128-bit random nonce. It swaps the nonce into the page in place of the placeholder and adds `'nonce-<nonce>'` to `style-src`. Other files keep the policy without a nonce, and `script-src` stays `'self'`.
- The renderer reads the nonce from the meta tag and gives it to dnd-kit's `StyleInjector`, which stamps it on the `<style>` elements it adds.

## Consequences

- The policy stays strict. Markup that got into the page could not add styles without guessing that load's nonce.
- Any other library that injects `<style>` elements can be handed the same nonce rather than loosening the policy.
- Serving `index.html` now reads and rewrites it, instead of passing the file straight through.
- In development the page carries the placeholder as its nonce, which is harmless because the dev server sends no policy.
- Only the packaged app runs under the policy, so the e2e drag test (`tests/e2e/board-drag.spec.ts`) is what guards this. It fails if the dragged task stops following the pointer.
