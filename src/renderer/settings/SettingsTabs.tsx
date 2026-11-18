import { useRef, type KeyboardEvent } from 'react';
import { settingsTabShortcut } from '../shortcuts/keymap';
import { ShortcutHint, shortcutAttributes, useShortcuts } from '../shortcuts/shortcuts';
import styles from './SettingsDialog.module.css';

export interface SettingsTab<Id extends string> {
  id: Id;
  label: string;
}

interface SettingsTabsProps<Id extends string> {
  tabs: ReadonlyArray<SettingsTab<Id>>;
  selected: Id;
  /** Makes an id unique to this dialog, for the tab and its panel. */
  idFor: (tab: Id, part: 'tab' | 'panel') => string;
  onSelect: (tab: Id) => void;
}

const NEXT_KEYS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

/**
 * The segmented tab bar at the top of Settings. ⌥⌘1 to ⌥⌘4 show a tab from anywhere in the dialog. Within the
 * bar, the arrow keys, Home and End move to another tab and show it, as in any tab list.
 */
export function SettingsTabs<Id extends string>({ tabs, selected, idFor, onSelect }: SettingsTabsProps<Id>) {
  const buttons = useRef(new Map<Id, HTMLButtonElement>());

  function show(tab: Id, moveFocus: boolean): void {
    onSelect(tab);
    if (moveFocus) buttons.current.get(tab)?.focus();
  }

  useShortcuts(tabs.map((tab, index) => [settingsTabShortcut(index + 1), () => show(tab.id, false)] as const));

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const current = tabs.findIndex((tab) => tab.id === selected);
    const step = NEXT_KEYS[event.key];
    let target: number | null = null;
    if (step !== undefined) target = (current + step + tabs.length) % tabs.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = tabs.length - 1;
    const tab = target === null ? undefined : tabs[target];
    if (tab === undefined) return;
    event.preventDefault();
    show(tab.id, true);
  }

  return (
    <div role="tablist" aria-label="Settings sections" className={styles.tabs} onKeyDown={handleKeyDown}>
      {tabs.map((tab, index) => {
        const isSelected = tab.id === selected;
        const shortcut = settingsTabShortcut(index + 1);
        return (
          <button
            key={tab.id}
            ref={(element) => {
              if (element === null) buttons.current.delete(tab.id);
              else buttons.current.set(tab.id, element);
            }}
            type="button"
            role="tab"
            id={idFor(tab.id, 'tab')}
            aria-selected={isSelected}
            aria-controls={idFor(tab.id, 'panel')}
            tabIndex={isSelected ? 0 : -1}
            className={styles.tab}
            {...shortcutAttributes(shortcut)}
            onClick={() => show(tab.id, false)}
          >
            {tab.label}
            <ShortcutHint id={shortcut} />
          </button>
        );
      })}
    </div>
  );
}
