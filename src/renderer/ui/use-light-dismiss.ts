import { useEffect, useRef, type RefObject } from 'react';

const PRIMARY_BUTTON = 0;

/**
 * The child of the document body that holds `node`. Modals and toasts are portalled into children of
 * their own, so nodes in different layers never share one.
 */
function layerOf(node: Node): Element | null {
  return Array.from(document.body.children).find((child) => child.contains(node)) ?? null;
}

function isOutside(panel: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && !panel.contains(target) && layerOf(target) === layerOf(panel);
}

/** Whether a press landed on the scrollbar of the element it targets, rather than on its content. */
function isOnOwnScrollbar(event: PointerEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const box = target.getBoundingClientRect();
  const x = event.clientX - box.left - target.clientLeft;
  const y = event.clientY - box.top - target.clientTop;
  const isOnVerticalBar = target.scrollHeight > target.clientHeight && x >= target.clientWidth;
  const isOnHorizontalBar = target.scrollWidth > target.clientWidth && y >= target.clientHeight;
  return isOnVerticalBar || isOnHorizontalBar;
}

/**
 * Swallows the click that ends the current press, so that the press does nothing beyond dismissing.
 * Listening stops once the press is over, whether or not a click followed it.
 */
function swallowClickEndingPress(): void {
  const listening = new AbortController();
  const options = { capture: true, signal: listening.signal };
  window.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      listening.abort();
    },
    options,
  );
  const stopAfterPress = (): void => void window.setTimeout(() => listening.abort(), 0);
  window.addEventListener('pointerup', stopAfterPress, options);
  window.addEventListener('pointercancel', stopAfterPress, options);
}

/**
 * Light-dismisses a non-modal panel in the page's own layer, rather than in a portalled layer of its own. `onDismiss` runs on Esc, unless
 * another control has already handled it, and on a primary-button press on the page outside the panel.
 * That press only dismisses: the click it ends is swallowed, so it never reaches what was under it.
 * Presses in another layer of the document body, such as a modal or a toast, and presses on a scrollbar
 * are left alone.
 */
export function useLightDismiss(panelRef: RefObject<HTMLElement | null>, onDismiss: () => void): void {
  const latestOnDismiss = useRef(onDismiss);
  latestOnDismiss.current = onDismiss;

  useEffect(() => {
    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !event.defaultPrevented) latestOnDismiss.current();
    }

    function dismissOnOutsidePress(event: PointerEvent): void {
      const panel = panelRef.current;
      if (panel === null || event.button !== PRIMARY_BUTTON) return;
      if (!isOutside(panel, event.target) || isOnOwnScrollbar(event)) return;
      swallowClickEndingPress();
      latestOnDismiss.current();
    }

    document.addEventListener('keydown', dismissOnEscape);
    document.addEventListener('pointerdown', dismissOnOutsidePress, { capture: true });
    return () => {
      document.removeEventListener('keydown', dismissOnEscape);
      document.removeEventListener('pointerdown', dismissOnOutsidePress, { capture: true });
    };
  }, [panelRef]);
}
