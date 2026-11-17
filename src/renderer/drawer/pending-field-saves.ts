import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

/** A drawer field that can hold an unsaved edit. */
export interface PendingField {
  commit: () => Promise<boolean>;
  discard: () => void;
}

/**
 * The drawer's fields that can hold an unsaved edit, so that Save can commit them all before closing and
 * a dismissal can drop them all.
 */
export interface PendingFieldSaves {
  register: (field: PendingField) => () => void;
  commitAll: () => Promise<boolean>;
  discardAll: () => void;
}

export const PendingFieldSavesContext = createContext<PendingFieldSaves | null>(null);

/**
 * Creates the registry the drawer's fields join. `commitAll` commits every field's draft, waits for each
 * save, including one already in flight, and resolves with whether all of them were saved. `discardAll`
 * drops every field's draft, so that nothing is saved when the drawer closes.
 */
export function usePendingFieldSaves(): PendingFieldSaves {
  const fields = useRef(new Set<PendingField>());
  return useMemo<PendingFieldSaves>(
    () => ({
      register: (field) => {
        fields.current.add(field);
        return () => {
          fields.current.delete(field);
        };
      },
      commitAll: async () => {
        const results = await Promise.all([...fields.current].map((field) => field.commit()));
        return results.every(Boolean);
      },
      discardAll: () => {
        fields.current.forEach((field) => field.discard());
      },
    }),
    [],
  );
}

/** Adds a field's latest `commit` and `discard` to the surrounding drawer's registry while it is shown. */
export function useFieldRegistration(field: PendingField): void {
  const registry = useContext(PendingFieldSavesContext);
  const latestField = useRef(field);
  latestField.current = field;
  useEffect(
    () =>
      registry?.register({
        commit: () => latestField.current.commit(),
        discard: () => latestField.current.discard(),
      }),
    [registry],
  );
}
