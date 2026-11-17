import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

type FieldCommit = () => Promise<boolean>;

/** The drawer's fields that can hold an unsaved edit, so that Save can commit them all before closing. */
export interface PendingFieldSaves {
  register: (commit: FieldCommit) => () => void;
  commitAll: () => Promise<boolean>;
}

export const PendingFieldSavesContext = createContext<PendingFieldSaves | null>(
  null,
);

/**
 * Creates the registry the drawer's fields join. `commitAll` commits every field's draft, waits for each
 * save, including one already in flight, and resolves with whether all of them were saved.
 */
export function usePendingFieldSaves(): PendingFieldSaves {
  const commits = useRef(new Set<FieldCommit>());
  return useMemo<PendingFieldSaves>(
    () => ({
      register: (commit) => {
        commits.current.add(commit);
        return () => {
          commits.current.delete(commit);
        };
      },
      commitAll: async () => {
        const results = await Promise.all(
          [...commits.current].map((commit) => commit()),
        );
        return results.every(Boolean);
      },
    }),
    [],
  );
}

/** Adds a field's latest `commit` to the surrounding drawer's registry for as long as the field is shown. */
export function useFieldCommitRegistration(commit: FieldCommit): void {
  const registry = useContext(PendingFieldSavesContext);
  const latestCommit = useRef(commit);
  latestCommit.current = commit;
  useEffect(() => registry?.register(() => latestCommit.current()), [registry]);
}
