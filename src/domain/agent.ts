import { isCommentsChange } from './ledger';
import { COLUMNS, isStatus, type HistoryEntry, type LocalDate, type Status, type Task } from './model';
import { localDateOf } from './time';

/** The terminals mboard can open the agent in, by the name the person knows them by. */
export const AGENT_TERMINALS = ['Ghostty', 'Terminal'] as const;

export type AgentTerminal = (typeof AGENT_TERMINALS)[number];

/**
 * How **Open agent** starts the person's AI agent: the terminal it opens, the shell command that starts the
 * agent (an alias works), the prompt the agent starts with, and the columns whose tasks follow that prompt.
 * A command holding `{prompt}` gets the prompt there; any other command gets it as its last argument.
 */
export interface AgentSettings {
  terminal: AgentTerminal;
  command: string;
  prompt: string;
  columns: Status[];
}

/** Where the agent's prompt goes in a command that doesn't simply take it as its last argument. */
export const AGENT_PROMPT_PLACEHOLDER = '{prompt}';

export const AGENT_COMMAND_MAX_LENGTH = 500;
export const AGENT_PROMPT_MAX_LENGTH = 20_000;

export const DEFAULT_AGENT_SETTINGS: Readonly<AgentSettings> = Object.freeze<AgentSettings>({
  terminal: 'Ghostty',
  command: 'claude',
  prompt:
    'Generate my list of activities split by project so I can lodge them on my timesheet. Use the pattern "project - task name - task description".',
  columns: ['Done'],
});

const NO_PROJECT_HEADING = 'No project';

/** Whether `value` is one of the terminals mboard can open. */
export function isAgentTerminal(value: unknown): value is AgentTerminal {
  return AGENT_TERMINALS.some((terminal) => terminal === value);
}

/** The columns in board order, each once. */
function inBoardOrder(columns: readonly Status[]): Status[] {
  return COLUMNS.filter((column) => columns.includes(column));
}

/**
 * The settings as they are saved: the command trimmed, the prompt trimmed with `\n` line breaks, and the
 * columns in board order, each once.
 */
export function normaliseAgentSettings(settings: AgentSettings): AgentSettings {
  return {
    terminal: settings.terminal,
    command: settings.command.trim(),
    prompt: settings.prompt.replace(/\r\n?/g, '\n').trim(),
    columns: inBoardOrder(settings.columns),
  };
}

/** The problem with agent settings in plain words, or `null` when they can be saved. */
export function agentSettingsProblem(settings: AgentSettings): string | null {
  if (!settings.columns.every(isStatus)) return `Choose columns from: ${COLUMNS.join(', ')}.`;
  const { terminal, command, prompt, columns } = normaliseAgentSettings(settings);
  if (!isAgentTerminal(terminal)) return `Choose one of these terminals: ${AGENT_TERMINALS.join(', ')}.`;
  if (command === '') return 'Enter the command that starts your agent, for example claude.';
  if (/[\r\n]/.test(command)) return 'The agent command must fit on one line.';
  if (command.length > AGENT_COMMAND_MAX_LENGTH) {
    return `The agent command can be at most ${AGENT_COMMAND_MAX_LENGTH} characters long.`;
  }
  if (prompt.length > AGENT_PROMPT_MAX_LENGTH) {
    return `The prompt can be at most ${AGENT_PROMPT_MAX_LENGTH.toLocaleString('en-GB')} characters long.`;
  }
  if (columns.length === 0) return 'Choose at least one column whose tasks the agent gets.';
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turns whatever `settings.json` held into usable agent settings. Each field that is missing or unusable falls
 * back to its default on its own, so one bad value never loses the others.
 */
export function sanitiseAgentSettings(raw: unknown): AgentSettings {
  const source = isRecord(raw) ? raw : {};
  const candidate = (patch: Partial<AgentSettings>): AgentSettings => ({ ...DEFAULT_AGENT_SETTINGS, ...patch });
  const terminal = isAgentTerminal(source['terminal']) ? source['terminal'] : DEFAULT_AGENT_SETTINGS.terminal;
  const command = typeof source['command'] === 'string' ? source['command'] : null;
  const prompt = typeof source['prompt'] === 'string' ? source['prompt'] : null;
  const listed = Array.isArray(source['columns']) ? (source['columns'] as unknown[]).filter(isStatus) : [];
  const usableCommand = command !== null && agentSettingsProblem(candidate({ command })) === null;
  const usablePrompt = prompt !== null && agentSettingsProblem(candidate({ prompt })) === null;
  return normaliseAgentSettings({
    terminal,
    command: usableCommand ? command : DEFAULT_AGENT_SETTINGS.command,
    prompt: usablePrompt ? prompt : DEFAULT_AGENT_SETTINGS.prompt,
    columns: listed.length > 0 ? listed : [...DEFAULT_AGENT_SETTINGS.columns],
  });
}

/** The live tasks in the agent's columns, which **Open agent** hands to the agent. */
export function tasksForAgent<T extends Pick<Task, 'status' | 'isArchived'>>(
  tasks: readonly T[],
  columns: readonly Status[],
): T[] {
  return tasks.filter((task) => !task.isArchived && columns.includes(task.status));
}

/** The columns as a phrase, for example `In progress and Done`. */
export function describeColumns(columns: readonly Status[]): string {
  const ordered = inBoardOrder(columns);
  if (ordered.length <= 1) return ordered.join('');
  return `${ordered.slice(0, -1).join(', ')} and ${ordered[ordered.length - 1]}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function entered(entry: HistoryEntry, column: Status): boolean {
  if (entry.ledger !== undefined) {
    return entry.ledger.changes.some(
      (change) => !isCommentsChange(change) && change.field === 'status' && change.to === column,
    );
  }
  const name = escapeRegExp(column);
  return new RegExp(`^Created in ${name}$| to ${name}$`).test(entry.text);
}

/**
 * The date a task last entered the column it is in, from its history: the latest dated entry that put it there.
 * For a task in Done, that's when it was completed. A task whose history doesn't say, for example one moved by an
 * outside edit, falls back to the date it was last updated.
 */
export function enteredColumnOn(task: Pick<Task, 'history' | 'updated' | 'status'>): LocalDate {
  const entry = task.history.findLast((candidate) => candidate.at !== '' && entered(candidate, task.status));
  return entry === undefined ? localDateOf(task.updated) : entry.at.slice(0, 10);
}

function quoted(text: string): string[] {
  return text.split('\n').map((line) => (line === '' ? '>' : `> ${line}`));
}

function columnFacts(task: Task, showsColumn: boolean): string[] {
  const since = enteredColumnOn(task);
  if (task.status === 'Done') return [...(showsColumn ? ['- Column: Done'] : []), `- Completed: ${since}`];
  return [`- Column: ${task.status}`, `- In ${task.status} since: ${since}`];
}

function taskBlock(task: Task, showsColumn: boolean): string {
  const facts = [
    ...columnFacts(task, showsColumn),
    `- Created: ${localDateOf(task.created)}`,
    ...(task.due === null ? [] : [`- Due: ${task.due}`]),
    `- File: ${task.id}`,
  ];
  const description = task.description === '' ? [] : ['', 'Description:', ...quoted(task.description)];
  const comments =
    task.comments.length === 0
      ? []
      : [
          '',
          'Comments:',
          ...task.comments.flatMap((comment) => [
            `- ${comment.at === '' ? 'Undated' : comment.at}`,
            ...quoted(comment.text).map((line) => `  ${line}`),
          ]),
        ];
  return [`### ${task.title}`, ...facts, ...description, ...comments].join('\n');
}

function byProject(tasks: readonly Task[]): Array<[string | null, Task[]]> {
  const groups = new Map<string | null, Task[]>();
  for (const task of tasks) groups.set(task.project, [...(groups.get(task.project) ?? []), task]);
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === null || b === null) return a === null ? 1 : -1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}

function byColumnThenDate(a: Task, b: Task): number {
  return (
    COLUMNS.indexOf(a.status) - COLUMNS.indexOf(b.status) ||
    enteredColumnOn(a).localeCompare(enteredColumnOn(b)) ||
    a.title.localeCompare(b.title)
  );
}

function introduction(count: number, columns: readonly Status[]): string {
  const tasks = count === 1 ? 'The 1 task' : `The ${count} tasks`;
  return `${tasks} in ${describeColumns(columns)} on my mboard board follow, grouped by project. Each file path is relative to the current folder, which is the board folder.`;
}

/**
 * The prompt **Open agent** starts the agent with: the person's own prompt, then the tasks from the agent's
 * columns, grouped by project (No project last) and ordered by column, then by the date each entered its
 * column. Each task lists its dates (a task in Done, the date it was completed), its file and, quoted, its
 * description and comments. With more than one column, each task also says which column it is in.
 */
export function composeAgentPrompt(prompt: string, tasks: readonly Task[], columns: readonly Status[]): string {
  const showsColumn = inBoardOrder(columns).length > 1;
  const projects = byProject(tasks).map(([project, projectTasks]) =>
    [
      `## ${project ?? NO_PROJECT_HEADING}`,
      ...[...projectTasks].sort(byColumnThenDate).map((task) => taskBlock(task, showsColumn)),
    ].join('\n\n'),
  );
  const ownPrompt = prompt.trim();
  return (
    [...(ownPrompt === '' ? [] : [ownPrompt, '---']), introduction(tasks.length, columns), ...projects].join('\n\n') +
    '\n'
  );
}
