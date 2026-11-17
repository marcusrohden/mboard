import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { projectColourIndex, projectColourOf, type ProjectColour, type ProjectColours } from '../../domain';

const ProjectColoursContext = createContext<ReadonlyMap<string, ProjectColour>>(new Map());

/** Shares the board's project colours, from the latest snapshot, with everything that shows a project. */
export function ProjectColoursProvider({ colours, children }: { colours: ProjectColours; children: ReactNode }) {
  const index = useMemo(() => projectColourIndex(colours), [colours]);
  return <ProjectColoursContext value={index}>{children}</ProjectColoursContext>;
}

/** The colour of `project`, matched ignoring case, or `null` when it has none or there is no project. */
export function useProjectColour(project: string | null): ProjectColour | null {
  return projectColourOf(project, useContext(ProjectColoursContext));
}
