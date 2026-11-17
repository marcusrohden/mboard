import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ariaShortcut, formatShortcut, type ShortcutId } from './keymap';
import { BASE_LAYER, ShortcutRegistry } from './shortcut-registry';
import styles from './shortcuts.module.css';

const ShortcutRegistryContext = createContext<ShortcutRegistry | null>(null);
const ShortcutLayerContext = createContext(BASE_LAYER);

/**
 * Listens for Command shortcuts anywhere in the window, text fields included, and runs the handler the
 * top layer registered for the chord. A handled key goes no further.
 */
export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new ShortcutRegistry());

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!registry.dispatch(event)) return;
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [registry]);

  return <ShortcutRegistryContext value={registry}>{children}</ShortcutRegistryContext>;
}

/** Gives a dialog its own layer of shortcuts while it is shown. Wrap the dialog's content in the result. */
export function ShortcutLayer({ children }: { children: ReactNode }) {
  const registry = useContext(ShortcutRegistryContext);
  const [layer] = useState(() => registry?.allocateLayer() ?? BASE_LAYER);
  useEffect(() => registry?.activateLayer(layer), [registry, layer]);
  return <ShortcutLayerContext value={layer}>{children}</ShortcutLayerContext>;
}

/**
 * Runs `run` when the shortcut `id` is pressed, while `enabled` and while this component's layer is on top.
 * Nothing is registered when `id` is `undefined`.
 */
export function useShortcut(id: ShortcutId | undefined, run: () => void, enabled = true): void {
  const registry = useContext(ShortcutRegistryContext);
  const layer = useContext(ShortcutLayerContext);
  const latestRun = useRef(run);
  latestRun.current = run;

  useEffect(() => {
    if (registry === null || id === undefined || !enabled) return undefined;
    return registry.register(id, layer, () => latestRun.current());
  }, [registry, layer, id, enabled]);
}

/**
 * Registers several shortcuts at once, each running its handler, while `enabled` and while this component's
 * layer is on top. For shortcuts that come as a set, such as one per column.
 */
export function useShortcuts(bindings: ReadonlyArray<readonly [ShortcutId, () => void]>, enabled = true): void {
  const registry = useContext(ShortcutRegistryContext);
  const layer = useContext(ShortcutLayerContext);
  const latestBindings = useRef(bindings);
  latestBindings.current = bindings;
  const ids = bindings.map(([id]) => id).join(' ');

  useEffect(() => {
    if (registry === null || !enabled) return undefined;
    const unregisters = latestBindings.current.map(([id], index) =>
      registry.register(id, layer, () => latestBindings.current[index]?.[1]()),
    );
    return () => unregisters.forEach((unregister) => unregister());
  }, [registry, layer, ids, enabled]);
}

/** The faded key hint shown at the bottom right of a control. Hidden from assistive technology, which reads `aria-keyshortcuts`. */
export function ShortcutHint({ id, text, className }: { id?: ShortcutId; text?: string; className?: string }) {
  const label = text ?? (id === undefined ? '' : formatShortcut(id));
  return (
    <kbd className={[styles.hint, className].filter(Boolean).join(' ')} aria-hidden="true">
      {label}
    </kbd>
  );
}

/** The `aria-keyshortcuts` attribute for a shortcut, or nothing when there is none. */
export function shortcutAttributes(id: ShortcutId | undefined): { 'aria-keyshortcuts'?: string } {
  return id === undefined ? {} : { 'aria-keyshortcuts': ariaShortcut(id) };
}
