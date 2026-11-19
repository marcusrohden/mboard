/**
 * Where a shortcut works. `app`, `board`, `task` and `screen` shortcuts work while no dialog is open;
 * `dialog` shortcuts work only in the dialog on top. `field` shortcuts belong to the field that has focus,
 * and `menu` shortcuts are menu accelerators handled by the main process. Both of those are only shown.
 */
export type ShortcutScope = 'app' | 'board' | 'task' | 'screen' | 'dialog' | 'field' | 'menu';

/** A key pressed with Command, plus Shift or Option when set. `code` is the physical key, as in `KeyboardEvent.code`. */
export interface Chord {
  code: string;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDefinition {
  chord: Chord;
  scopes: readonly ShortcutScope[];
}

const COLUMN_COUNT = 5;
const REMINDER_LINK_COUNT = 9;
const SETTINGS_TAB_COUNT = 4;

type ColumnShortcutId = `moveToColumn${1 | 2 | 3 | 4 | 5}`;
type ReminderShortcutId = `openReminder${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
type SettingsTabShortcutId = `settingsTab${1 | 2 | 3 | 4}`;

function letter(key: string, modifiers: Omit<Chord, 'code'> = {}): Chord {
  return { code: `Key${key}`, ...modifiers };
}

function numbered<Id extends string>(
  count: number,
  idFor: (n: number) => Id,
  definitionFor: (n: number) => ShortcutDefinition,
): Record<Id, ShortcutDefinition> {
  const entries = Array.from({ length: count }, (_, index) => [idFor(index + 1), definitionFor(index + 1)] as const);
  return Object.fromEntries(entries) as Record<Id, ShortcutDefinition>;
}

const NAMED = {
  settings: { chord: { code: 'Comma' }, scopes: ['menu'] },

  installUpdate: { chord: letter('I'), scopes: ['app', 'dialog'] },
  downloadUpdate: { chord: letter('G'), scopes: ['app', 'dialog'] },
  releaseNotes: { chord: letter('G', { shift: true }), scopes: ['app', 'dialog'] },
  dismissUpdate: { chord: letter('L', { shift: true }), scopes: ['app'] },

  newTask: { chord: letter('N'), scopes: ['board'] },
  focusSearch: { chord: letter('F'), scopes: ['board'] },
  toggleArchived: { chord: letter('E', { shift: true }), scopes: ['board'] },
  openAgent: { chord: letter('O', { shift: true }), scopes: ['board'] },
  projectFilter: { chord: letter('P', { shift: true }), scopes: ['board'] },
  dueFilter: { chord: letter('D', { shift: true }), scopes: ['board'] },
  staleOnly: { chord: letter('S', { shift: true }), scopes: ['board'] },
  clearFilters: { chord: letter('X', { shift: true }), scopes: ['board'] },
  archiveAllDone: { chord: letter('A', { alt: true }), scopes: ['board'] },
  dismissReminders: { chord: letter('B', { shift: true }), scopes: ['board'] },
  toggleUnreadable: { chord: letter('I', { shift: true }), scopes: ['board'] },

  saveTask: { chord: letter('S'), scopes: ['task'] },
  closeTask: { chord: { code: 'Period' }, scopes: ['task'] },
  archiveTask: { chord: letter('A', { shift: true }), scopes: ['task'] },
  restoreTask: { chord: letter('R', { shift: true }), scopes: ['task'] },
  openInObsidian: { chord: letter('O'), scopes: ['task'] },
  commentOnTask: { chord: letter('C', { shift: true }), scopes: ['task'] },
  deleteTask: { chord: { code: 'Backspace', shift: true }, scopes: ['task'] },
  toggleHistory: { chord: letter('H', { shift: true }), scopes: ['task'] },
  revertToHere: { chord: letter('U', { shift: true }), scopes: ['task'] },

  addComment: { chord: { code: 'Enter' }, scopes: ['field'] },
  removeDueDate: { chord: { code: 'Backspace' }, scopes: ['field'] },

  confirm: { chord: { code: 'Enter' }, scopes: ['dialog', 'screen'] },
  cancel: { chord: { code: 'Period' }, scopes: ['dialog', 'screen'] },
  chooseFolder: { chord: letter('O'), scopes: ['dialog', 'screen'] },
  checkForUpdates: { chord: letter('U'), scopes: ['dialog'] },
  toggleOpenAtLogin: { chord: letter('L'), scopes: ['dialog'] },
  resetAgeColours: { chord: letter('R'), scopes: ['dialog'] },
  nextTerminal: { chord: letter('T'), scopes: ['dialog'] },
  openProjectNote: { chord: letter('O', { shift: true }), scopes: ['dialog'] },

  tryAgain: { chord: letter('R'), scopes: ['screen'] },
} as const satisfies Record<string, ShortcutDefinition>;

/**
 * Every keyboard shortcut in mboard, each a Command chord in the spirit of VS Code's keys. One table, so
 * that a test can check no two shortcuts that can work at the same time share a chord.
 */
export const SHORTCUTS: Readonly<Record<ShortcutId, ShortcutDefinition>> = {
  ...NAMED,
  ...numbered<ColumnShortcutId>(
    COLUMN_COUNT,
    (n) => `moveToColumn${n}` as ColumnShortcutId,
    (n) => ({ chord: { code: `Digit${n}` }, scopes: ['task', 'dialog'] }),
  ),
  ...numbered<ReminderShortcutId>(
    REMINDER_LINK_COUNT,
    (n) => `openReminder${n}` as ReminderShortcutId,
    (n) => ({ chord: { code: `Digit${n}`, alt: true }, scopes: ['board'] }),
  ),
  ...numbered<SettingsTabShortcutId>(
    SETTINGS_TAB_COUNT,
    (n) => `settingsTab${n}` as SettingsTabShortcutId,
    (n) => ({ chord: { code: `Digit${n}`, alt: true }, scopes: ['dialog'] }),
  ),
};

export type ShortcutId = keyof typeof NAMED | ColumnShortcutId | ReminderShortcutId | SettingsTabShortcutId;

/** The shortcut that moves a task to the column at `position` (1 to 5), left to right. */
export function columnShortcut(position: number): ColumnShortcutId {
  return `moveToColumn${position}` as ColumnShortcutId;
}

/** The shortcut that shows the Settings tab at `position` (1 to 4), left to right. */
export function settingsTabShortcut(position: number): SettingsTabShortcutId {
  return `settingsTab${position}` as SettingsTabShortcutId;
}

/** The shortcut that opens the reminder at `position` (1 to 9), or `null` beyond the ninth. */
export function reminderShortcut(position: number): ReminderShortcutId | null {
  return position >= 1 && position <= REMINDER_LINK_COUNT ? (`openReminder${position}` as ReminderShortcutId) : null;
}

const KEY_GLYPHS: Readonly<Record<string, string>> = {
  Comma: ',',
  Period: '.',
  Enter: '↵',
  Backspace: '⌫',
};

const KEY_NAMES: Readonly<Record<string, string>> = {
  Comma: ',',
  Period: '.',
  Enter: 'Enter',
  Backspace: 'Backspace',
};

function keyLabel(code: string, names: Readonly<Record<string, string>>): string {
  return names[code] ?? code.replace(/^(Key|Digit)/, '');
}

/** How a chord is shown: modifiers in the macOS order, then the key, for example `⌥⇧⌘A`. */
export function formatChord(chord: Chord): string {
  return `${chord.alt === true ? '⌥' : ''}${chord.shift === true ? '⇧' : ''}⌘${keyLabel(chord.code, KEY_GLYPHS)}`;
}

/** A chord as `aria-keyshortcuts` spells it, for example `Alt+Shift+Meta+A`. */
export function ariaChord(chord: Chord): string {
  const modifiers = [chord.alt === true && 'Alt', chord.shift === true && 'Shift', 'Meta'].filter(Boolean);
  return [...modifiers, keyLabel(chord.code, KEY_NAMES)].join('+');
}

/** The shown form of a shortcut. */
export function formatShortcut(id: ShortcutId): string {
  return formatChord(SHORTCUTS[id].chord);
}

/** The `aria-keyshortcuts` value of a shortcut. */
export function ariaShortcut(id: ShortcutId): string {
  return ariaChord(SHORTCUTS[id].chord);
}

/**
 * Whether a key event is `chord`: Command held, Control not (it moves the caret in macOS text fields), and
 * Shift and Option exactly as the chord says.
 */
export function matchesChord(
  chord: Chord,
  event: Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): boolean {
  return (
    event.metaKey &&
    !event.ctrlKey &&
    event.code === chord.code &&
    event.shiftKey === (chord.shift === true) &&
    event.altKey === (chord.alt === true)
  );
}

/** The column shortcuts shown as one hint, `⌘1–5`. */
export const COLUMN_SHORTCUTS_HINT = `${formatChord({ code: 'Digit1' })}–${COLUMN_COUNT}`;

/** The column shortcuts as `aria-keyshortcuts`. */
export const COLUMN_SHORTCUTS_ARIA = Array.from({ length: COLUMN_COUNT }, (_, index) =>
  ariaChord({ code: `Digit${index + 1}` }),
).join(' ');
