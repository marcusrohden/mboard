import { useEffect, useRef } from 'react';

interface ShortcutHandlers {
  onFocusSearch: () => void;
  onNewTask: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Registers the board's single-key shortcuts: `/` focuses the search box and `N` opens the New task
 * dialog. They stay out of the way while typing, with a modifier held, or while `isEnabled` is false.
 */
export function useGlobalShortcuts(handlers: ShortcutHandlers, isEnabled: boolean): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!isEnabled) return undefined;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === '/') {
        event.preventDefault();
        handlersRef.current.onFocusSearch();
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        handlersRef.current.onNewTask();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
