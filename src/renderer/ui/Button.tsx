import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * A compact push button. Defaults to `type="button"` so it never submits a surrounding form.
 */
export function Button({ variant = 'default', className, type = 'button', ...rest }: ButtonProps) {
  const classNames = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return <button type={type} className={classNames} {...rest} />;
}
