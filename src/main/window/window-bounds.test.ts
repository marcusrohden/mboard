import { describe, expect, it } from 'vitest';
import { restorableBounds } from './window-bounds';

const LAPTOP = { x: 0, y: 25, width: 1512, height: 920 };
const EXTERNAL = { x: 1512, y: -300, width: 2560, height: 1415 };

describe('restorableBounds', () => {
  it('restores bounds on a connected display', () => {
    const saved = { x: 1800, y: 0, width: 1200, height: 800 };
    expect(restorableBounds(saved, [LAPTOP, EXTERNAL])).toEqual(saved);
  });

  it('drops bounds left on a display that is no longer connected', () => {
    expect(restorableBounds({ x: 1800, y: 0, width: 1200, height: 800 }, [LAPTOP])).toBeUndefined();
  });

  it('drops bounds with only a sliver on screen', () => {
    expect(restorableBounds({ x: 1480, y: 100, width: 1200, height: 800 }, [LAPTOP])).toBeUndefined();
  });

  it('has nothing to restore without saved bounds', () => {
    expect(restorableBounds(undefined, [LAPTOP])).toBeUndefined();
  });
});
