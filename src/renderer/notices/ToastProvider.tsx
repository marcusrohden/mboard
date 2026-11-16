import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MODAL_EXEMPT_ATTRIBUTE } from '../ui/modal-isolation';
import styles from './Toasts.module.css';

const TOAST_LIFETIME_MS = 7000;

interface Toast {
  key: number;
  message: string;
}

type Notify = (message: string) => void;

const ToastContext = createContext<Notify | null>(null);

/**
 * Shows short messages in the corner of the window. Each toast dismisses itself after a few seconds,
 * or when its Dismiss button is pressed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextKey = useRef(0);

  const dismiss = useCallback((key: number) => {
    setToasts((current) => current.filter((toast) => toast.key !== key));
  }, []);

  const notify = useCallback<Notify>(
    (message) => {
      const key = nextKey.current++;
      setToasts((current) => [...current, { key, message }]);
      window.setTimeout(() => dismiss(key), TOAST_LIFETIME_MS);
    },
    [dismiss],
  );

  const host = (
    <div className={styles.region} {...{ [MODAL_EXEMPT_ATTRIBUTE]: '' }}>
      {toasts.map((toast) => (
        <div key={toast.key} role="alert" className={styles.toast}>
          <span>{toast.message}</span>
          <button type="button" className={styles.dismiss} aria-label="Hide message" onClick={() => dismiss(toast.key)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {createPortal(host, document.body)}
    </ToastContext.Provider>
  );
}

/**
 * Returns a function that shows a toast.
 *
 * @throws {Error} when used outside a `ToastProvider`.
 */
export function useToasts(): Notify {
  const notify = useContext(ToastContext);
  if (notify === null) throw new Error('useToasts must be used inside a ToastProvider.');
  return notify;
}
