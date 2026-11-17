import { useEffect, useRef, type RefObject } from 'react';

function isFocusOnNothing(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}

/**
 * Keeps keyboard focus out from under the drawer, which covers part of the board. Focus moves to the
 * panel itself when it opens and whenever it switches to another task, so typing edits nothing. On
 * close, focus goes back to what had it before, if that is still on the page and nothing else has
 * taken focus since, such as a control pressed outside the drawer.
 */
export function useDrawerFocus(panelRef: RefObject<HTMLElement | null>, taskKey: string): void {
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !panel.contains(focused)) {
      returnFocusTo.current = focused;
    }
    panel.focus();
  }, [panelRef, taskKey]);

  useEffect(
    () => () => {
      const target = returnFocusTo.current;
      if (target !== null && target.isConnected && isFocusOnNothing()) target.focus();
    },
    [],
  );
}
