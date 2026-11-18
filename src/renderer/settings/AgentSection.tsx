import { useEffect, useId, useRef, useState } from 'react';
import {
  AGENT_PROMPT_PLACEHOLDER,
  AGENT_TERMINALS,
  COLUMNS,
  agentSettingsProblem,
  normaliseAgentSettings,
  type AgentSettings,
  type AgentTerminal,
  type Status,
} from '../../domain';
import { ShortcutHint, shortcutAttributes, useShortcut } from '../shortcuts/shortcuts';
import { useRunCommand } from '../state/use-run-command';
import fields from '../ui/fields.module.css';
import styles from './SettingsDialog.module.css';
import { SettingsRow, SettingsSection } from './SettingsSection';

function terminalAfter(terminal: AgentTerminal): AgentTerminal {
  const next = AGENT_TERMINALS[(AGENT_TERMINALS.indexOf(terminal) + 1) % AGENT_TERMINALS.length];
  return next ?? terminal;
}

type Field = keyof AgentSettings;

const SECTION_OF_FIELD: Readonly<Record<Field, 'launch' | 'prompt'>> = {
  terminal: 'launch',
  command: 'launch',
  prompt: 'prompt',
  columns: 'prompt',
};

function sameSettings(a: AgentSettings, b: AgentSettings): boolean {
  const left = normaliseAgentSettings(a);
  const right = normaliseAgentSettings(b);
  return (
    left.terminal === right.terminal &&
    left.command === right.command &&
    left.prompt === right.prompt &&
    left.columns.join('\n') === right.columns.join('\n')
  );
}

/**
 * Settings for **Open agent**, in two groups: Agent (the terminal and the command that starts the agent) and
 * Prompt (the prompt it starts with and the columns whose tasks follow it). The terminal saves as soon as it is
 * picked, or switched with ⌘T, and a column as soon as it is ticked; the last ticked column can't be unticked.
 * The command and prompt save when their field is left, Enter is pressed in the command, or Settings closes.
 * Settings that can't be saved show the reason under their group and save nothing.
 */
export function AgentSection() {
  const run = useRunCommand();
  const ids = { terminal: useId(), command: useId(), commandHint: useId(), prompt: useId() };
  const [saved, setSaved] = useState<AgentSettings | null>(null);
  const [draft, setDraft] = useState<AgentSettings | null>(null);
  const [problem, setProblem] = useState<{ field: Field; message: string } | null>(null);
  const latest = useRef({ saved, draft });
  latest.current = { saved, draft };
  const submitted = useRef<AgentSettings | null>(null);

  useEffect(() => {
    let isMounted = true;
    void run((api) => api.getAgentSettings()).then((result) => {
      if (!isMounted || !result.ok) return;
      setSaved(result.value);
      setDraft(result.value);
    });
    return () => {
      isMounted = false;
    };
  }, [run]);

  useEffect(
    () => () => {
      const { saved: lastSaved, draft: lastDraft } = latest.current;
      if (lastSaved === null || lastDraft === null || sameSettings(lastSaved, lastDraft)) return;
      if (submitted.current !== null && sameSettings(submitted.current, lastDraft)) return;
      if (agentSettingsProblem(lastDraft) === null) void run((api) => api.setAgentSettings(lastDraft));
    },
    [run],
  );

  async function save(next: AgentSettings, field: Field): Promise<void> {
    const found = agentSettingsProblem(next);
    setProblem(found === null ? null : { field, message: found });
    if (found !== null || saved === null || sameSettings(next, saved)) return;
    submitted.current = next;
    const result = await run((api) => api.setAgentSettings(next));
    if (!result.ok) return;
    setSaved(result.value);
    setDraft((current) => (current !== null && sameSettings(current, next) ? result.value : current));
  }

  function change(patch: Partial<AgentSettings>): AgentSettings | null {
    if (draft === null) return null;
    const next = { ...draft, ...patch };
    setDraft(next);
    return next;
  }

  function pickTerminal(terminal: AgentTerminal): void {
    const next = change({ terminal });
    if (next !== null) void save(next, 'terminal');
  }

  useShortcut(
    'nextTerminal',
    () => {
      if (draft !== null) pickTerminal(terminalAfter(draft.terminal));
    },
    draft !== null,
  );

  function toggleColumn(column: Status, isIncluded: boolean): void {
    if (draft === null) return;
    const columns = COLUMNS.filter((candidate) =>
      candidate === column ? isIncluded : draft.columns.includes(candidate),
    );
    const next = change({ columns });
    if (next !== null) void save(next, 'columns');
  }

  const alertFor = (section: 'launch' | 'prompt') =>
    problem !== null && SECTION_OF_FIELD[problem.field] === section ? (
      <p role="alert" className={fields.error}>
        {problem.message}
      </p>
    ) : undefined;

  if (draft === null) {
    return (
      <SettingsSection title="Agent">
        <SettingsRow label="Loading…" />
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection
        title="Agent"
        note={
          alertFor('launch') ??
          'Open agent starts your AI agent in a terminal, in the board folder, with the prompt and tasks below.'
        }
      >
        <SettingsRow label="Terminal" labelFor={ids.terminal} description="Opens a new window for each agent.">
          <select
            id={ids.terminal}
            className={styles.select}
            value={draft.terminal}
            {...shortcutAttributes('nextTerminal')}
            onChange={(event) => pickTerminal(event.target.value as AgentTerminal)}
          >
            {AGENT_TERMINALS.map((terminal) => (
              <option key={terminal} value={terminal}>
                {terminal}
              </option>
            ))}
          </select>
          <ShortcutHint id="nextTerminal" />
        </SettingsRow>
        <SettingsRow
          label="Agent command"
          labelFor={ids.command}
          description={
            <span id={ids.commandHint}>
              Runs in your login shell, so aliases work. The prompt goes at the end, or wherever you write{' '}
              <code>{AGENT_PROMPT_PLACEHOLDER}</code>.
            </span>
          }
          layout="stacked"
        >
          <input
            id={ids.command}
            type="text"
            className={styles.textInput}
            value={draft.command}
            placeholder="claude"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby={ids.commandHint}
            onChange={(event) => change({ command: event.target.value })}
            onBlur={() => void save(draft, 'command')}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void save(draft, 'command');
            }}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Prompt" note={alertFor('prompt')}>
        <SettingsRow
          label="Prompt"
          labelFor={ids.prompt}
          description="What you ask the agent. The tasks follow it."
          layout="stacked"
        >
          <textarea
            id={ids.prompt}
            className={styles.textArea}
            value={draft.prompt}
            onChange={(event) => change({ prompt: event.target.value })}
            onBlur={() => void save(draft, 'prompt')}
          />
        </SettingsRow>
        <SettingsRow
          label="Tasks from"
          description="The agent gets the tasks in these columns, grouped by project."
          layout="stacked"
        >
          <div role="group" aria-label="Agent column options" className={styles.choices}>
            {COLUMNS.map((column) => {
              const isIncluded = draft.columns.includes(column);
              const isLast = isIncluded && draft.columns.length === 1;
              return (
                <label
                  key={column}
                  className={styles.choice}
                  title={isLast ? 'The agent needs at least one column.' : undefined}
                >
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={isIncluded}
                    disabled={isLast}
                    onChange={(event) => toggleColumn(column, event.target.checked)}
                  />
                  {column}
                </label>
              );
            })}
          </div>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
