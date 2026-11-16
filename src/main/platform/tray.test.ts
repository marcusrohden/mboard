import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { Preferences } from '../../shared/contract';
import { PlatformState } from './platform-state';
import { renderTrayIconPng, renderTrayIconRgba, TRAY_ICON_SIZES } from './tray-icon';
import { buildTrayMenu } from './tray-menu';

function actions() {
  return { openWindow: vi.fn(), chooseFolder: vi.fn(), toggleOpenAtLogin: vi.fn(), quit: vi.fn() };
}

describe('buildTrayMenu', () => {
  it('lists the items in the spec order, with separators', () => {
    const menu = buildTrayMenu({ openAtLogin: true, notificationsAvailable: null }, actions());
    expect(menu.map((item) => item.label ?? item.type)).toEqual([
      'Open mboard',
      'Change board folder…',
      'separator',
      'Open at login',
      'separator',
      'Quit',
    ]);
  });

  it('shows Open at login as a checkbox reflecting the preference', () => {
    const on = buildTrayMenu({ openAtLogin: true, notificationsAvailable: null }, actions());
    const off = buildTrayMenu({ openAtLogin: false, notificationsAvailable: null }, actions());
    expect(on.find((item) => item.label === 'Open at login')).toMatchObject({ type: 'checkbox', checked: true });
    expect(off.find((item) => item.label === 'Open at login')).toMatchObject({ type: 'checkbox', checked: false });
  });

  it('asks for the opposite value when Open at login is clicked', () => {
    const handlers = actions();
    const menu = buildTrayMenu({ openAtLogin: true, notificationsAvailable: null }, handlers);
    menu.find((item) => item.label === 'Open at login')?.click?.();
    expect(handlers.toggleOpenAtLogin).toHaveBeenCalledWith(false);
  });

  it.each<[boolean | null, boolean]>([
    [null, false],
    [true, false],
    [false, true],
  ])('shows "Notifications unavailable" only when notificationsAvailable is false (%s)', (available, shown) => {
    const preferences: Preferences = { openAtLogin: true, notificationsAvailable: available };
    const item = buildTrayMenu(preferences, actions()).find((entry) => entry.label === 'Notifications unavailable');
    expect(item !== undefined).toBe(shown);
    if (item !== undefined) {
      expect(item.enabled).toBe(false);
      expect(item.click).toBeUndefined();
    }
  });

  it('wires Open mboard, Change board folder and Quit to their actions', () => {
    const handlers = actions();
    const menu = buildTrayMenu({ openAtLogin: true, notificationsAvailable: null }, handlers);
    for (const label of ['Open mboard', 'Change board folder…', 'Quit']) {
      menu.find((item) => item.label === label)?.click?.();
    }
    expect(handlers.openWindow).toHaveBeenCalledOnce();
    expect(handlers.chooseFolder).toHaveBeenCalledOnce();
    expect(handlers.quit).toHaveBeenCalledOnce();
  });
});

describe('tray icon', () => {
  function decode(png: Buffer) {
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const idatLength = png.readUInt32BE(33);
    const idat = png.subarray(41, 41 + idatLength);
    return { width, height, colourType: png[25], raw: inflateSync(idat) };
  }

  it.each(TRAY_ICON_SIZES)('renders a valid %i px RGBA PNG', (size) => {
    const { width, height, colourType, raw } = decode(renderTrayIconPng(size));
    expect([width, height, colourType]).toEqual([size, size, 6]);
    expect(raw.length).toBe((size * 4 + 1) * size);
  });

  it.each(TRAY_ICON_SIZES)('is solid black with the shape in the alpha channel at %i px', (size) => {
    const pixels = renderTrayIconRgba(size);
    let opaque = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      expect([pixels[offset], pixels[offset + 1], pixels[offset + 2]]).toEqual([0, 0, 0]);
      if (pixels[offset + 3] === 255) opaque++;
    }
    expect(opaque).toBeGreaterThan(size);
    expect(pixels.some((value, index) => index % 4 === 3 && value === 0)).toBe(true);
  });

  it('draws the 2x rendition as the 1x shape scaled up', () => {
    const small = renderTrayIconRgba(16);
    const large = renderTrayIconRgba(32);
    const alphaAt = (pixels: Uint8Array, size: number, x: number, y: number) => pixels[(y * size + x) * 4 + 3];
    expect(alphaAt(small, 16, 3, 5)).toBe(255);
    expect(alphaAt(large, 32, 6, 10)).toBe(255);
    expect(alphaAt(small, 16, 0, 0)).toBe(0);
    expect(alphaAt(large, 32, 0, 0)).toBe(0);
  });
});

describe('PlatformState', () => {
  it('does not notify preference listeners when nothing changed', () => {
    const state = new PlatformState();
    const listener = vi.fn();
    state.onPreferencesChange(listener);
    state.setOpenAtLogin(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('replaces a banner entry for the same task rather than duplicating it', () => {
    const state = new PlatformState();
    const first = { taskId: 'a', title: 'A', due: '2026-11-16', overdue: false };
    state.recordDelivery('failed', [first]);
    state.recordDelivery('failed', [{ ...first, overdue: true }]);
    expect(state.reminderBanner()).toEqual([{ ...first, overdue: true }]);
  });

  it('keeps the banner when a later notification is shown', () => {
    const state = new PlatformState();
    state.recordDelivery('failed', [{ taskId: 'a', title: 'A', due: '2026-11-16', overdue: false }]);
    state.recordDelivery('shown', []);
    expect(state.reminderBanner()).toHaveLength(1);
    expect(state.preferences().notificationsAvailable).toBe(true);
  });

  it('returns copies so callers cannot change the banner', () => {
    const state = new PlatformState();
    state.recordDelivery('failed', [{ taskId: 'a', title: 'A', due: '2026-11-16', overdue: false }]);
    state.reminderBanner().pop();
    expect(state.reminderBanner()).toHaveLength(1);
  });
});
