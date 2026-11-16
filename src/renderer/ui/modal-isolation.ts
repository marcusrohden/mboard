export const MODAL_EXEMPT_ATTRIBUTE = 'data-modal-exempt';

/**
 * Hides everything in the document body except `modalHost` and elements marked with
 * `MODAL_EXEMPT_ATTRIBUTE` from assistive technology and from interaction. Returns a function that
 * restores the previous state.
 */
export function isolateModal(modalHost: HTMLElement): () => void {
  const restorers = Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => element !== modalHost && !element.hasAttribute(MODAL_EXEMPT_ATTRIBUTE))
    .map((element) => {
      const previousAriaHidden = element.getAttribute('aria-hidden');
      const wasInert = element.inert;
      element.setAttribute('aria-hidden', 'true');
      element.inert = true;
      return () => {
        if (previousAriaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', previousAriaHidden);
        element.inert = wasInert;
      };
    });
  return () => restorers.forEach((restore) => restore());
}
