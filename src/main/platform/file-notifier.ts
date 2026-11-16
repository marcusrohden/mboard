import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Notifier } from '../ports';
import type { NotificationLog } from './notification-log';

/**
 * The fake notifier used when `MBOARD_NOTIFIER_LOG` is set. It appends `{"title","body","taskId"}` as one JSON
 * line per notification, then reports `failed` when `fails` is true and `shown` otherwise.
 */
export function createFileNotifier(options: { logPath: string; fails: boolean; log: NotificationLog }): Notifier {
  const { logPath, fails, log } = options;
  return {
    async notify({ title, body, taskId }) {
      const result = await appendRequest(logPath, JSON.stringify({ title, body, taskId }), fails);
      await log.record({ title, result, detail: 'fake notifier' });
      return result;
    },
  };
}

async function appendRequest(logPath: string, line: string, fails: boolean): Promise<'shown' | 'failed'> {
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, `${line}\n`, 'utf8');
  } catch {
    return 'failed';
  }
  return fails ? 'failed' : 'shown';
}
