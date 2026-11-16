import type { Stats } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { TaskDocument } from '../../domain';
import { parseTaskFile } from '../../domain';
import { isFileSystemError, isNotFound, isPermissionDenied } from '../fs/fs-errors';

/** A task file read from disk: gone, present but not a readable task, or a parsed task with its raw text. */
export type LoadedTaskFile =
  | { kind: 'missing' }
  | { kind: 'unreadable'; fingerprint: string; reason: string }
  | { kind: 'task'; fingerprint: string; content: string; document: TaskDocument };

const MISSING: LoadedTaskFile = { kind: 'missing' };

/**
 * Identifies one version of a file from its metadata. When it is unchanged, the parsed file can be reused
 * without reading the file again.
 */
export function fingerprintOf(stats: Stats): string {
  return [stats.ino, stats.size, stats.mtimeMs, stats.ctimeMs, stats.birthtimeMs].join(':');
}

/** The file's metadata, or `null` when nothing is there or it isn't a file. */
export async function statTaskFile(filePath: string): Promise<Stats | null> {
  try {
    const stats = await stat(filePath);
    return stats.isFile() ? stats : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function describeReadFailure(error: unknown): string {
  if (isPermissionDenied(error)) return "mboard doesn't have permission to read this file.";
  if (isFileSystemError(error)) return `The file couldn't be read (${error.code}).`;
  return "The file couldn't be read.";
}

async function readStats(filePath: string, knownStats: Stats | undefined): Promise<Stats | null | Error> {
  if (knownStats !== undefined) return knownStats;
  try {
    return await statTaskFile(filePath);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Reads and parses one task file. Files that vanish while being read are reported missing, and files that
 * can't be read or parsed are reported unreadable with a plain-words reason.
 */
export async function loadTaskFile(filePath: string, fileName: string, knownStats?: Stats): Promise<LoadedTaskFile> {
  const stats = await readStats(filePath, knownStats);
  if (stats === null) return MISSING;
  if (stats instanceof Error) return { kind: 'unreadable', fingerprint: '', reason: describeReadFailure(stats) };
  const fingerprint = fingerprintOf(stats);
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return MISSING;
    return { kind: 'unreadable', fingerprint, reason: describeReadFailure(error) };
  }
  const parsed = parseTaskFile(content, { fileName, birthtime: stats.birthtime, mtime: stats.mtime });
  if (parsed.kind === 'unreadable') return { kind: 'unreadable', fingerprint, reason: parsed.reason };
  return { kind: 'task', fingerprint, content, document: parsed.document };
}
