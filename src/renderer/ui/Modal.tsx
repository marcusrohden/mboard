import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isolateModal } from './modal-isolation';
import styles from './Modal.module.css';

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
export const AUTOFOCUS_ATTRIBUTE = 'data-autofocus';

interface ModalProps {
  role?: 'dialog' | 'alertdialog';
  label: string;
  onClose: () => void;
  children: ReactNode;
}

function focusableElementsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function keepFocusInside(event: KeyboardEvent<HTMLElement>): void {
  const focusable = focusableElementsIn(event.currentTarget);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * A modal dialog rendered into the document body. It hides the rest of the page from assistive
 * technology, keeps keyboard focus inside, closes on Esc and returns focus to where it was on close.
 * Focus starts on the element marked `data-autofocus`, otherwise the first focusable element.
 */
export function Modal({ role = 'dialog', label, onClose, children }: ModalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const panel = panelRef.current;
    if (host === null || panel === null) return undefined;
    const previouslyFocused = document.activeElement;
    const restoreIsolation = isolateModal(host);
    const initialFocus = panel.querySelector<HTMLElement>(`[${AUTOFOCUS_ATTRIBUTE}]`) ?? focusableElementsIn(panel)[0];
    initialFocus?.focus();
    return () => {
      restoreIsolation();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      keepFocusInside(event);
    }
  }

  return createPortal(
    <div ref={hostRef} className={styles.overlay}>
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={label}
        className={styles.panel}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
