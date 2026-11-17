import { useRef, type ButtonHTMLAttributes } from 'react';
import type { ShortcutId } from '../shortcuts/keymap';
import { ShortcutHint, shortcutAttributes, useShortcut } from '../shortcuts/shortcuts';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** A shortcut that presses this button while it is shown and enabled. Its key is shown on the button. */
  shortcut?: ShortcutId;
  /** A shortcut handled elsewhere that does what this button does. Its key is only shown on the button. */
  shortcutHint?: ShortcutId;
}

/**
 * A compact push button. Defaults to `type="button"` so it never submits a surrounding form. A button with a
 * shortcut shows its key, faded, at the bottom right, and announces it through `aria-keyshortcuts`.
 */
export function Button({
  variant = 'default',
  className,
  type = 'button',
  shortcut,
  shortcutHint,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useShortcut(shortcut, () => ref.current?.click(), disabled !== true);
  const shown = shortcut ?? shortcutHint;
  const classNames = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={classNames} disabled={disabled} {...shortcutAttributes(shown)} {...rest}>
      {children}
      {shown !== undefined && <ShortcutHint id={shown} />}
    </button>
  );
}
