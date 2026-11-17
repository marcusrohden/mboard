import { useRef, useState } from 'react';

export interface EditableValue {
  displayed: string;
  begin: () => void;
  change: (next: string) => void;
  commit: (next?: string) => Promise<boolean>;
  cancel: () => void;
}

interface SaveAttempt {
  value: string;
  result: Promise<boolean>;
}

/**
 * The editing state of one drawer field. While the field is being edited, or its save is in flight, it
 * shows the person's draft. Otherwise it shows `value` straight from the latest snapshot, so outside
 * changes appear in every field except the one being edited. `commit` saves a changed draft once and
 * resolves with whether it was saved; committing again while that save is in flight waits for it.
 */
export function useEditableValue(value: string, save: (next: string) => Promise<boolean>): EditableValue {
  const [draft, setDraft] = useState<string | null>(null);
  const inFlight = useRef<SaveAttempt | null>(null);
  const isCancelling = useRef(false);

  async function saveValue(next: string): Promise<boolean> {
    const attempt = { value: next, result: save(next) };
    inFlight.current = attempt;
    const saved = await attempt.result;
    if (inFlight.current === attempt) {
      inFlight.current = null;
      setDraft(null);
    }
    return saved;
  }

  async function commit(next: string | undefined = draft ?? undefined): Promise<boolean> {
    if (isCancelling.current) {
      isCancelling.current = false;
      setDraft(null);
      return true;
    }
    const pending = inFlight.current;
    if (pending !== null && (next === undefined || next === pending.value)) return pending.result;
    if (next === undefined || next === value) {
      if (pending === null) setDraft(null);
      return pending?.result ?? true;
    }
    return saveValue(next);
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
