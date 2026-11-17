import { useId, useState } from 'react';
import {
  AGE_THRESHOLD_RANGE,
  DEFAULT_AGE_THRESHOLDS,
  ageThresholdsProblem,
  sameAgeThresholds,
  tierName,
  type AgeThresholds,
} from '../../domain';
import { useAgeThresholds } from '../state/age-thresholds';
import { useRunCommand } from '../state/use-run-command';
import { Button } from '../ui/Button';
import fields from '../ui/fields.module.css';
import styles from './SettingsDialog.module.css';
import { SettingsSection } from './SettingsSection';

type ThresholdKey = keyof AgeThresholds;
type Drafts = Record<ThresholdKey, string>;
type AdjustableLevel = 'amber' | 'orange' | 'red';

const ADJUSTABLE_TIERS: ReadonlyArray<{ key: ThresholdKey; level: AdjustableLevel }> = [
  { key: 'nudgeFrom', level: 'amber' },
  { key: 'stallingFrom', level: 'orange' },
  { key: 'staleFrom', level: 'red' },
];

function draftsOf(thresholds: AgeThresholds): Drafts {
  return {
    nudgeFrom: String(thresholds.nudgeFrom),
    stallingFrom: String(thresholds.stallingFrom),
    staleFrom: String(thresholds.staleFrom),
  };
}

function thresholdsOf(drafts: Drafts): AgeThresholds {
  const read = (draft: string): number => (draft.trim() === '' ? Number.NaN : Number(draft));
  return {
    nudgeFrom: read(drafts.nudgeFrom),
    stallingFrom: read(drafts.stallingFrom),
    staleFrom: read(drafts.staleFrom),
  };
}

function onTrackRange(nudgeFrom: number): string {
  const lastDay = nudgeFrom - 1;
  return lastDay === 0 ? '0 working days' : `0–${lastDay} working days`;
}

interface ThresholdRowProps {
  level: AdjustableLevel;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}

function ThresholdRow({ level, value, onChange, onCommit }: ThresholdRowProps) {
  const id = useId();
  return (
    <li className={styles.legendRow}>
      <span className={styles.swatch} data-level={level} aria-hidden="true" />
      <label htmlFor={id} className={styles.tier}>
        {tierName(level)} from
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={AGE_THRESHOLD_RANGE.min}
        max={AGE_THRESHOLD_RANGE.max}
        step={1}
        className={styles.days}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit();
          }
        }}
      />
      <span>working days</span>
    </li>
  );
}

/**
 * Settings' legend of the age colours, where the working days each colour starts from are set. A change
 * is saved when its field is left or Enter is pressed, as long as the three thresholds still make sense;
 * otherwise the reason shows and nothing is saved. Reset to defaults saves 2, 4 and 6 again.
 */
export function AgeColoursSection() {
  const saved = useAgeThresholds();
  const run = useRunCommand();
  const [drafts, setDrafts] = useState(() => draftsOf(saved));
  const [syncedWith, setSyncedWith] = useState(saved);
  const [problem, setProblem] = useState<string | null>(null);

  if (!sameAgeThresholds(syncedWith, saved)) {
    setSyncedWith(saved);
    setDrafts(draftsOf(saved));
    setProblem(null);
  }

  async function save(next: AgeThresholds): Promise<void> {
    const found = ageThresholdsProblem(next);
    setProblem(found);
    if (found !== null || sameAgeThresholds(next, saved)) return;
    await run((api) => api.setAgeThresholds(next));
  }

  function resetToDefaults(): void {
    setDrafts(draftsOf(DEFAULT_AGE_THRESHOLDS));
    void save({ ...DEFAULT_AGE_THRESHOLDS });
  }

  const isAtDefaults = sameAgeThresholds(saved, DEFAULT_AGE_THRESHOLDS) && problem === null;

  return (
    <SettingsSection title="Age colours">
      <p className={styles.muted}>A task changes colour as working days pass without an update.</p>
      <ul className={styles.legend}>
        <li className={styles.legendRow}>
          <span className={styles.swatch} data-level="green" aria-hidden="true" />
          <span className={styles.tier}>{tierName('green')}</span>
          <span>{onTrackRange(saved.nudgeFrom)}</span>
        </li>
        {ADJUSTABLE_TIERS.map(({ key, level }) => (
          <ThresholdRow
            key={key}
            level={level}
            value={drafts[key]}
            onChange={(value) => setDrafts((current) => ({ ...current, [key]: value }))}
            onCommit={() => void save(thresholdsOf(drafts))}
          />
        ))}
        <li className={styles.legendRow}>
          <span className={styles.swatch} data-level="grey" aria-hidden="true" />
          <span>Tasks in Done and archived tasks are always grey.</span>
        </li>
      </ul>
      {problem !== null && (
        <p role="alert" className={fields.error}>
          {problem}
        </p>
      )}
      <Button disabled={isAtDefaults} onClick={resetToDefaults}>
        Reset to defaults
      </Button>
    </SettingsSection>
  );
}
