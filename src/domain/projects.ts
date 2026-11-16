import type { Task } from './model';

type ProjectSource = Pick<Task, 'project' | 'updated'>;

/** Trims a project name and collapses repeated whitespace. An empty result becomes `null`. */
export function normaliseProject(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  return collapsed === '' ? null : collapsed;
}

/**
 * Normalises a project name and, when it matches an existing project ignoring case, returns the
 * existing spelling. The first match in `knownProjects` wins.
 */
export function canonicalProject(raw: string | null | undefined, knownProjects: readonly string[]): string | null {
  const normalised = normaliseProject(raw);
  if (normalised === null) return null;
  const wanted = normalised.toLowerCase();
  return knownProjects.find((known) => known.toLowerCase() === wanted) ?? normalised;
}

/**
 * Suggests projects for autocomplete. Draws on every task, board and archive alike, lists the most
 * recently updated project first, and keeps names that contain `query` ignoring case.
 */
export function projectSuggestions(tasks: readonly ProjectSource[], query = ''): string[] {
  const lastUpdatedByProject = new Map<string, string>();
  for (const { project, updated } of tasks) {
    if (project === null) continue;
    const previous = lastUpdatedByProject.get(project);
    if (previous === undefined || updated > previous) lastUpdatedByProject.set(project, updated);
  }
  const wanted = query.trim().toLowerCase();
  return [...lastUpdatedByProject]
    .filter(([project]) => project.toLowerCase().includes(wanted))
    .sort(([nameA, updatedA], [nameB, updatedB]) => updatedB.localeCompare(updatedA) || nameA.localeCompare(nameB))
    .map(([project]) => project);
}
