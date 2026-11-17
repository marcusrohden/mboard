import { ageLabel, stalenessOf, type LocalDate, type Task } from '../../domain';
import { describeAge } from '../lib/format';
import styles from './AgeChip.module.css';

interface AgeChipProps {
  task: Pick<Task, 'created' | 'updated' | 'status' | 'isArchived'>;
  today: LocalDate;
}

/**
 * A task's age chip: the working days since its last update as `Nd`, coloured by its staleness tier. Its
 * tooltip and its accessible text give both timestamps, the count and the tier's name.
 */
export function AgeChip({ task, today }: AgeChipProps) {
  const staleness = stalenessOf(task, today);
  const description = describeAge(task, today);
  return (
    <span
      className={styles.chip}
      data-staleness={staleness.level}
      title={description}
    >
      <span aria-hidden="true">{ageLabel(staleness)}</span>
      <span className="visually-hidden">{description}</span>
    </span>
  );
}
