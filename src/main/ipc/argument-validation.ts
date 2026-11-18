import {
  AGENT_TERMINALS,
  COLUMNS,
  PROJECT_COLOURS,
  ageThresholdsProblem,
  agentSettingsProblem,
  isAgentTerminal,
  isProjectColour,
  isStatus,
} from '../../domain';
import type {
  AgeThresholds,
  AgentSettings,
  LocalDate,
  NewTaskInput,
  ProjectColour,
  RevertExpectation,
  Status,
  TaskEdit,
  TaskId,
} from '../../shared/contract';

type PlainObject = Record<string, unknown>;

const NEW_TASK_KEYS = ['description', 'due', 'project', 'status', 'title'] as const;
const TASK_EDIT_KEYS = ['field', 'value'] as const;
const REVERT_EXPECTATION_KEYS = ['at', 'historyLength', 'text'] as const;
const AGE_THRESHOLD_KEYS = ['nudgeFrom', 'staleFrom', 'stallingFrom'] as const;
const AGENT_SETTINGS_KEYS = ['columns', 'command', 'prompt', 'terminal'] as const;

/** Builds the error for a request from the renderer that doesn't have the shape the contract describes. */
export function invalidRequest(detail: string): Error {
  return new Error(`That request wasn't valid: ${detail}.`);
}

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: PlainObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function readString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw invalidRequest(`${what} must be text`);
  return value;
}

function readNullableString(value: unknown, what: string): string | null {
  return value === null ? null : readString(value, `${what}, when set,`);
}

/**
 * Checks that an invoke call carried exactly `count` arguments and returns them.
 *
 * @throws Error when there are more or fewer.
 */
export function expectArguments(args: readonly unknown[], count: number): unknown[] {
  if (args.length !== count)
    throw invalidRequest(`expected ${count} argument${count === 1 ? '' : 's'}, got ${args.length}`);
  return [...args];
}

/** A task id: any text. Whether it names a task file is the board's decision. */
export function readTaskId(value: unknown): TaskId {
  return readString(value, 'the task id');
}

/** A task id or `null`, as in `moveTask`'s `beforeId`. */
export function readOptionalTaskId(value: unknown): TaskId | null {
  return value === null ? null : readTaskId(value);
}

/** One of the board's columns. */
export function readStatus(value: unknown): Status {
  if (!isStatus(value)) throw invalidRequest(`the column must be one of ${COLUMNS.join(', ')}`);
  return value;
}

function readDue(value: unknown): LocalDate | null {
  return readNullableString(value, 'the due date');
}

/** Free text, such as a comment. */
export function readText(value: unknown, what: string): string {
  return readString(value, what);
}

/** Free text or `null`, such as the comment that may come with a move. */
export function readOptionalText(value: unknown, what: string): string | null {
  return readNullableString(value, what);
}

function readCount(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidRequest(`${what} must be a whole number from 0`);
  }
  return value;
}

/** The position of a history entry, oldest first: a whole number from 0. */
export function readEntryIndex(value: unknown): number {
  return readCount(value, 'the history entry');
}

/** The history entry a revert expects to find, with exactly `historyLength`, `at` and `text`. */
export function readRevertExpectation(value: unknown): RevertExpectation {
  if (!isPlainObject(value) || !hasExactKeys(value, REVERT_EXPECTATION_KEYS)) {
    throw invalidRequest(`a revert needs exactly these details of the entry: ${REVERT_EXPECTATION_KEYS.join(', ')}`);
  }
  return {
    historyLength: readCount(value['historyLength'], 'the history length'),
    at: readString(value['at'], "the entry's time"),
    text: readString(value['text'], "the entry's text"),
  };
}

/** A folder path, as sent back by the renderer to confirm a folder. */
export function readFolderPath(value: unknown): string {
  return readString(value, 'the folder path');
}

/** A yes or no setting. */
export function readBoolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') throw invalidRequest(`${what} must be true or false`);
  return value;
}

/** The fields of a new task, with exactly the contract's keys. */
export function readNewTaskInput(value: unknown): NewTaskInput {
  if (!isPlainObject(value) || !hasExactKeys(value, NEW_TASK_KEYS)) {
    throw invalidRequest(`a new task needs exactly these fields: ${NEW_TASK_KEYS.join(', ')}`);
  }
  return {
    title: readString(value['title'], 'the title'),
    status: readStatus(value['status']),
    project: readNullableString(value['project'], 'the project'),
    due: readDue(value['due']),
    description: readString(value['description'], 'the description'),
  };
}

/** A single-field edit, with exactly `field` and `value`, and a value of the right type for the field. */
export function readTaskEdit(value: unknown): TaskEdit {
  if (!isPlainObject(value) || !hasExactKeys(value, TASK_EDIT_KEYS)) {
    throw invalidRequest('an edit needs exactly a field and a value');
  }
  const editedValue = value['value'];
  switch (value['field']) {
    case 'title':
      return { field: 'title', value: readString(editedValue, 'the title') };
    case 'description':
      return { field: 'description', value: readString(editedValue, 'the description') };
    case 'project':
      return { field: 'project', value: readNullableString(editedValue, 'the project') };
    case 'due':
      return { field: 'due', value: readDue(editedValue) };
    default:
      throw invalidRequest('the field must be one of title, description, project, due');
  }
}

/**
 * Age-colour thresholds, with exactly `nudgeFrom`, `stallingFrom` and `staleFrom`.
 *
 * @throws Error naming the problem in plain words when they aren't a usable set.
 */
export function readAgeThresholds(value: unknown): AgeThresholds {
  if (!isPlainObject(value) || !hasExactKeys(value, AGE_THRESHOLD_KEYS)) {
    throw invalidRequest(`age thresholds need exactly ${AGE_THRESHOLD_KEYS.join(', ')}`);
  }
  const thresholds = {
    nudgeFrom: value['nudgeFrom'],
    stallingFrom: value['stallingFrom'],
    staleFrom: value['staleFrom'],
  } as AgeThresholds;
  const problem = ageThresholdsProblem(thresholds);
  if (problem !== null) throw new Error(problem);
  return thresholds;
}

/** A project's name, as text. Whether it names a project is the board's decision. */
export function readProjectName(value: unknown): string {
  return readString(value, 'the project');
}

/** One of the palette's project colours, or `null` for none. */
export function readProjectColour(value: unknown): ProjectColour | null {
  if (value === null || isProjectColour(value)) return value;
  throw invalidRequest(`the colour must be one of ${PROJECT_COLOURS.join(', ')}, or null`);
}

/**
 * Agent settings, with exactly `terminal`, `command`, `prompt` and `columns`.
 *
 * @throws Error naming the problem in plain words when they can't be saved.
 */
export function readAgentSettings(value: unknown): AgentSettings {
  if (!isPlainObject(value) || !hasExactKeys(value, AGENT_SETTINGS_KEYS)) {
    throw invalidRequest(`agent settings need exactly ${AGENT_SETTINGS_KEYS.join(', ')}`);
  }
  const terminal = value['terminal'];
  if (!isAgentTerminal(terminal)) throw invalidRequest(`the terminal must be one of ${AGENT_TERMINALS.join(', ')}`);
  const columns = value['columns'];
  if (!Array.isArray(columns)) throw invalidRequest("the agent's columns must be a list");
  const settings: AgentSettings = {
    terminal,
    command: readString(value['command'], 'the agent command'),
    prompt: readString(value['prompt'], 'the prompt'),
    columns: columns.map(readStatus),
  };
  const problem = agentSettingsProblem(settings);
  if (problem !== null) throw new Error(problem);
  return settings;
}
