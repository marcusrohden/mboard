import { describe, expect, it } from 'vitest';
import {
  SHORTCUTS,
  ariaChord,
  formatChord,
  formatShortcut,
  matchesChord,
  type Chord,
  type ShortcutId,
  type ShortcutScope,
} from './keymap';

const entries = Object.entries(SHORTCUTS) as Array<[ShortcutId, (typeof SHORTCUTS)[ShortcutId]]>;

/** Scopes whose shortcuts can work at the same moment. Menu accelerators work everywhere. */
const SIMULTANEOUS_SCOPES: ReadonlyArray<readonly ShortcutScope[]> = [
  ['menu', 'app', 'board', 'task', 'field'],
  ['menu', 'app', 'screen'],
  ['menu', 'dialog'],
];

function chordKey({ code, shift = false, alt = false }: Chord): string {
  return `${alt ? 'alt+' : ''}${shift ? 'shift+' : ''}${code}`;
}

const RESERVED: ReadonlyArray<[string, Chord]> = [
  ['Undo', { code: 'KeyZ' }],
  ['Redo', { code: 'KeyZ', shift: true }],
  ['Cut', { code: 'KeyX' }],
  ['Copy', { code: 'KeyC' }],
  ['Paste', { code: 'KeyV' }],
  ['Paste and Match Style', { code: 'KeyV', shift: true, alt: true }],
  ['Select All', { code: 'KeyA' }],
  ['Minimise', { code: 'KeyM' }],
  ['Close window', { code: 'KeyW' }],
  ['Hide mboard', { code: 'KeyH' }],
  ['Hide Others', { code: 'KeyH', alt: true }],
  ['Quit', { code: 'KeyQ' }],
  ['Screenshot', { code: 'Digit3', shift: true }],
  ['Screenshot selection', { code: 'Digit4', shift: true }],
  ['Screenshot app', { code: 'Digit5', shift: true }],
  ['Touch Bar screenshot', { code: 'Digit6', shift: true }],
  ['Spotlight', { code: 'Space' }],
  ['Switch apps', { code: 'Tab' }],
  ['Switch windows', { code: 'Backquote' }],
  ['Line start', { code: 'ArrowLeft' }],
  ['Line end', { code: 'ArrowRight' }],
  ['Text start', { code: 'ArrowUp' }],
  ['Text end', { code: 'ArrowDown' }],
];

describe('the keymap', () => {
  it('never gives two shortcuts that can work at the same time the same chord', () => {
    for (const scopes of SIMULTANEOUS_SCOPES) {
      const byChord = new Map<string, ShortcutId[]>();
      for (const [id, definition] of entries) {
        if (!definition.scopes.some((scope) => scopes.includes(scope))) continue;
        const key = chordKey(definition.chord);
        byChord.set(key, [...(byChord.get(key) ?? []), id]);
      }
      const clashes = [...byChord.values()].filter((ids) => ids.length > 1);
      expect(clashes, `clashes among ${scopes.join(', ')}`).toEqual([]);
    }
  });

  it('leaves the menus, macOS and text editing their own keys', () => {
    const reserved = new Map(RESERVED.map(([name, chord]) => [chordKey(chord), name]));
    const taken = entries.filter(([, definition]) => reserved.has(chordKey(definition.chord)));
    expect(taken.map(([id]) => id)).toEqual([]);
  });

  it('keeps ⌘, for the Settings menu item and ⌘⌫ for fields', () => {
    const owners = (code: string, shift = false) =>
      entries.filter(([, { chord }]) => chord.code === code && (chord.shift === true) === shift && chord.alt !== true);
    expect(owners('Comma').map(([, definition]) => definition.scopes)).toEqual([['menu']]);
    expect(owners('Backspace').map(([, definition]) => definition.scopes)).toEqual([['field']]);
  });

  it('shows chords with the macOS modifier order and names them for assistive technology', () => {
    expect(formatShortcut('newTask')).toBe('⌘N');
    expect(formatShortcut('toggleArchived')).toBe('⇧⌘E');
    expect(formatShortcut('archiveAllDone')).toBe('⌥⌘A');
    expect(formatShortcut('deleteTask')).toBe('⇧⌘⌫');
    expect(formatShortcut('confirm')).toBe('⌘↵');
    expect(formatShortcut('openReminder3')).toBe('⌥⌘3');
    expect(formatChord(SHORTCUTS.closeTask.chord)).toBe('⌘.');
    expect(ariaChord(SHORTCUTS.archiveAllDone.chord)).toBe('Alt+Meta+A');
    expect(ariaChord(SHORTCUTS.deleteTask.chord)).toBe('Shift+Meta+Backspace');
    expect(ariaChord(SHORTCUTS.cancel.chord)).toBe('Meta+.');
  });

  it('matches only Command chords with exactly the chord’s Shift and Option', () => {
    const chord = SHORTCUTS.toggleArchived.chord;
    const press = { code: 'KeyE', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false };
    expect(matchesChord(chord, press)).toBe(true);
    expect(matchesChord(chord, { ...press, shiftKey: false })).toBe(false);
    expect(matchesChord(chord, { ...press, altKey: true })).toBe(false);
    expect(matchesChord(chord, { ...press, ctrlKey: true })).toBe(false);
    expect(matchesChord(chord, { ...press, metaKey: false, ctrlKey: true })).toBe(false);
  });
});
