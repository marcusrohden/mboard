import { describe, expect, it, vi } from 'vitest';
import { BASE_LAYER, ShortcutRegistry } from './shortcut-registry';

const COMMAND_N = { code: 'KeyN', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, repeat: false };
const COMMAND_PERIOD = { ...COMMAND_N, code: 'Period' };

describe('ShortcutRegistry', () => {
  it('runs the latest handler for a chord in the base layer, and nothing for an unbound chord', () => {
    const registry = new ShortcutRegistry();
    const first = vi.fn();
    const second = vi.fn();
    registry.register('newTask', BASE_LAYER, first);
    const unregister = registry.register('newTask', BASE_LAYER, second);

    expect(registry.dispatch(COMMAND_N)).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    unregister();
    registry.dispatch(COMMAND_N);
    expect(first).toHaveBeenCalledOnce();
    expect(registry.dispatch({ ...COMMAND_N, code: 'KeyJ' })).toBe(false);
  });

  it('ignores held-down repeats', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register('newTask', BASE_LAYER, run);
    expect(registry.dispatch({ ...COMMAND_N, repeat: true })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('only runs the top dialog’s handlers, and goes back down when any dialog closes', () => {
    const registry = new ShortcutRegistry();
    const page = vi.fn();
    const settings = vi.fn();
    const confirm = vi.fn();
    registry.register('newTask', BASE_LAYER, page);
    const settingsLayer = registry.allocateLayer();
    const confirmLayer = registry.allocateLayer();
    registry.register('cancel', settingsLayer, settings);
    registry.register('cancel', confirmLayer, confirm);
    const closeSettings = registry.activateLayer(settingsLayer);
    const closeConfirm = registry.activateLayer(confirmLayer);

    expect(registry.dispatch(COMMAND_N)).toBe(false);
    registry.dispatch(COMMAND_PERIOD);
    expect(confirm).toHaveBeenCalledOnce();

    closeSettings();
    registry.dispatch(COMMAND_PERIOD);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(settings).not.toHaveBeenCalled();

    closeConfirm();
    registry.dispatch(COMMAND_N);
    expect(page).toHaveBeenCalledOnce();
  });
});
