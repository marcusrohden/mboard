import type { ProjectColour } from '../../domain';
import { useProjectColour } from '../state/project-colours';
import { ColourPicker } from '../ui/ColourPicker';

interface ProjectColourFieldProps {
  project: string;
  onChange: (project: string, colour: ProjectColour | null) => void;
}

/** The colour of a project, shared by every task in it, picked from the palette under the Project field. */
export function ProjectColourField({ project, onChange }: ProjectColourFieldProps) {
  const colour = useProjectColour(project);
  return <ColourPicker label={`Colour for ${project}`} value={colour} onChange={(next) => onChange(project, next)} />;
}
