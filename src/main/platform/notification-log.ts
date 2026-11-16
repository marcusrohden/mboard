import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { formatLocalDateTime } from '../../domain';
import type { Clock } from '../ports';

export const LOG_FILE_NAME = 'mboard.log';

/** One notification attempt, as recorded for the user to check by hand whether macOS showed it. */
export interface NotificationLogEntry {
  title: string;
  result: 'shown' | 'failed';
  detail?: string;
}

export interface NotificationLog {
  record(entry: NotificationLogEntry): Promise<void>;
}

/** Formats one log line: `<local timestamp> <result> <JSON title>`, followed by ` (<detail>)` when there is one. */
export function formatLogLine(timestamp: string, entry: NotificationLogEntry): string {
  const detail = entry.detail === undefined ? '' : ` (${entry.detail})`;
  return `${timestamp} notification ${entry.result} ${JSON.stringify(entry.title)}${detail}\n`;
}

/**
 * Appends every notification outcome to a log file. Logging never throws: a log that can't be written is
 * reported through `onError` and the reminder carries on.
 */
export function createNotificationLog(options: {
  filePath: string;
  clock: Clock;
  onError(error: unknown): void;
}): NotificationLog {
  const { filePath, clock, onError } = options;
  return {
    async record(entry) {
      try {
        await mkdir(path.dirname(filePath), { recursive: true });
        await appendFile(filePath, formatLogLine(formatLocalDateTime(clock.now()), entry), 'utf8');
      } catch (error) {
        onError(error);
      }
    },
  };
}
