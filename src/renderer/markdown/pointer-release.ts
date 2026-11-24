let isPointerDown = false;
let isTracking = false;

function release(): void {
  isPointerDown = false;
}

/** Starts following pointer presses on the window, once. Call it before a press can matter, such as on mount. */
export function trackPointerPresses(): void {
  if (isTracking) return;
  isTracking = true;
  window.addEventListener('pointerdown', () => (isPointerDown = true), true);
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
}

/**
 * Runs `action` at once when no pointer press is in progress, or else once the press is released and its click
 * has been dispatched. A field that changes size when it loses focus defers that change with it, so the press
 * that took its focus still lands on the control it was aimed at, which would otherwise move from under the
 * pointer between mousedown and mouseup. Returns a function that cancels an action not yet run.
 */
export function afterPointerRelease(action: () => void): () => void {
  if (!isPointerDown) {
    action();
    return () => undefined;
  }
  let timer: number | undefined;
  const onRelease = (): void => {
    timer = window.setTimeout(action, 0);
  };
  const options = { capture: true, once: true } as const;
  window.addEventListener('pointerup', onRelease, options);
  window.addEventListener('pointercancel', onRelease, options);
  return () => {
    window.removeEventListener('pointerup', onRelease, options);
    window.removeEventListener('pointercancel', onRelease, options);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

/** Whether a pointer press is in progress. */
export function isPointerPressed(): boolean {
  return isPointerDown;
}
