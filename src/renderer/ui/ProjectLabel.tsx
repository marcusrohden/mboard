import { useProjectColour } from '../state/project-colours';
import styles from './project-colours.module.css';

/** A project's name, in the project's colour when it has one. */
export function ProjectLabel({ project }: { project: string }) {
  const colour = useProjectColour(project);
  return (
    <span className={styles.label} data-colour={colour ?? undefined}>
      {project}
    </span>
  );
}
