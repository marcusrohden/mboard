import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import styles from './FilterPopover.module.css';

interface FilterPopoverProps {
  label: string;
  isActive: boolean;
  activeCount?: number;
  closesOnChange?: boolean;
  children: ReactNode;
}

/**
 * A header button that opens a small panel of options beneath it. The panel closes on Esc, on a click
 * outside it, or when focus leaves it. The button keeps the plain name of the filter, and marks an active filter visually.
 */
export function FilterPopover({ label, isActive, activeCount, closesOnChange = false, children }: FilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnOutsidePointer(event: PointerEvent): void {
      if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          setIsOpen(false);
          rootRef.current?.querySelector('button')?.focus();
        }
      }}
      onBlur={(event) => {
        if (isOpen && !(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
          setIsOpen(false);
        }
      }}
    >
      <Button
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        data-active={isActive || undefined}
        className={styles.trigger}
        onClick={() => setIsOpen((open) => !open)}
      >
        {label}
        {isActive && activeCount !== undefined && (
          <span aria-hidden="true" className={styles.count}>
            {activeCount}
          </span>
        )}
      </Button>
      {isOpen && (
        <div
          id={panelId}
          tabIndex={-1}
          role="group"
          aria-label={`${label} options`}
          className={styles.panel}
          onChange={() => closesOnChange && setIsOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
