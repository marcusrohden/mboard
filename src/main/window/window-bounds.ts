import type { WindowBounds } from '../ports';

/** A screen rectangle, such as a display's work area. */
export type Rectangle = WindowBounds;

const MINIMUM_VISIBLE_WIDTH = 100;
const MINIMUM_VISIBLE_HEIGHT = 50;

function visibleOverlap(window: Rectangle, area: Rectangle): { width: number; height: number } {
  const width = Math.min(window.x + window.width, area.x + area.width) - Math.max(window.x, area.x);
  const height = Math.min(window.y + window.height, area.y + area.height) - Math.max(window.y, area.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/**
 * The saved window bounds to restore, or `undefined` to use the default placement. Bounds are restored only
 * when enough of the window would land on a connected display to grab it, so a window saved on a display
 * that has since been unplugged never opens out of reach.
 */
export function restorableBounds(
  saved: WindowBounds | undefined,
  workAreas: readonly Rectangle[],
): WindowBounds | undefined {
  if (saved === undefined) return undefined;
  const reachable = workAreas.some((area) => {
    const overlap = visibleOverlap(saved, area);
    return overlap.width >= MINIMUM_VISIBLE_WIDTH && overlap.height >= MINIMUM_VISIBLE_HEIGHT;
  });
  return reachable ? saved : undefined;
}
