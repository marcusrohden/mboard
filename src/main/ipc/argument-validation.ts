import { COLUMNS, RESPONSIBILITIES, isResponsibility, isStatus } from '../../domain';
import type { LocalDate, NewTaskInput, Responsibility, Status, TaskEdit, TaskId } from '../../shared/contract';

type PlainObject = Record<string, unknown>;

const NEW_TASK_KEYS = ['description', 'due', 'project', 'responsibility', 'status', 'title'] as const;
const TASK_EDIT_KEYS = ['field', 'value'] as const;

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
  if (args.length !== count) throw invalidRequest(`expected ${count} argument${count === 1 ? '' : 's'}, got ${args.length}`);
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

function readResponsibility(value: unknown): Responsibility {
  if (!isResponsibility(value)) throw invalidRequest(`the responsibility must be one of ${RESPONSIBILITIES.join(', ')}`);
  return value;
}

function readDue(value: unknown): LocalDate | null {
  return readNullableString(value, 'the due date');
}

/** Free text, such as a comment. */
export function readText(value: unknown, what: string): string {
  return readString(value, what);
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
    responsibility: readResponsibility(value['responsibility']),
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
    case 'responsibility':
      return { field: 'responsibility', value: readResponsibility(editedValue) };
    case 'due':
      return { field: 'due', value: readDue(editedValue) };
    default:
      throw invalidRequest('the field must be one of title, description, project, responsibility, due');
  }
}
