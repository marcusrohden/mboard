import { useRef, useState } from 'react';

export interface EditableValue {
  displayed: string;
  begin: () => void;
  change: (next: string) => void;
  commit: (next?: string) => Promise<void>;
  cancel: () => void;
}

/**
 * The editing state of one drawer field. While the field is being edited, or its save is in flight, it
 * shows the person's draft. Otherwise it shows `value` straight from the latest snapshot, so outside
 * changes appear in every field except the one being edited. `commit` saves a changed draft once.
 */
export function useEditableValue(value: string, save: (next: string) => Promise<boolean>): EditableValue {
  const [draft, setDraft] = useState<string | null>(null);
  const savingValue = useRef<string | null>(null);
  const isCancelling = useRef(false);

  async function commit(next: string | undefined = draft ?? undefined): Promise<void> {
    if (isCancelling.current) {
      isCancelling.current = false;
      setDraft(null);
      return;
    }
    if (next === undefined || next === value || savingValue.current === next) {
      if (savingValue.current === null) setDraft(null);
      return;
    }
    savingValue.current = next;
    await save(next);
    savingValue.current = null;
    setDraft(null);
  }

  return {
    displayed: draft ?? value,
    begin: () => setDraft((current) => current ?? value),
    change: setDraft,
    commit,
    cancel: () => {
      isCancelling.current = true;
    },
  };
}
