import { SHORTCUTS, matchesChord, type ShortcutId } from './keymap';

/** The layer of the page itself, under any dialog. */
export const BASE_LAYER = 0;

interface Registration {
  id: ShortcutId;
  layer: number;
  order: number;
  run: () => void;
}

type KeyEvent = Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'repeat'>;

/**
 * Which handler each shortcut runs. Handlers live in layers: the page is the base layer, and every open
 * dialog adds one on top. Only the top active layer's handlers run, so a dialog's keys never reach the page
 * behind it. When two handlers in that layer share a chord, the one registered last wins.
 */
export class ShortcutRegistry {
  private readonly registrations = new Set<Registration>();
  private readonly activeLayers: number[] = [];
  private nextLayer = BASE_LAYER + 1;
  private nextOrder = 0;

  /** Reserves a layer for a dialog. It takes effect once activated. */
  allocateLayer(): number {
    return this.nextLayer++;
  }

  /** Puts `layer` on top until the returned function removes it, wherever it is in the stack by then. */
  activateLayer(layer: number): () => void {
    this.activeLayers.push(layer);
    return () => {
      const index = this.activeLayers.lastIndexOf(layer);
      if (index !== -1) this.activeLayers.splice(index, 1);
    };
  }

  register(id: ShortcutId, layer: number, run: () => void): () => void {
    const registration = { id, layer, order: this.nextOrder++, run };
    this.registrations.add(registration);
    return () => {
      this.registrations.delete(registration);
    };
  }

  /** Runs the handler for `event`, if the top layer has one, and says whether it did. Held-down repeats run nothing. */
  dispatch(event: KeyEvent): boolean {
    if (event.repeat) return false;
    const topLayer = this.activeLayers.at(-1) ?? BASE_LAYER;
    let chosen: Registration | null = null;
    for (const registration of this.registrations) {
      if (registration.layer !== topLayer || !matchesChord(SHORTCUTS[registration.id].chord, event)) continue;
      if (chosen === null || registration.order > chosen.order) chosen = registration;
    }
    chosen?.run();
    return chosen !== null;
  }
}
