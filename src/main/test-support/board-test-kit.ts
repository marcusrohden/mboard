import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BoardSnapshot } from '../../shared/contract';
import type { BoardService, Clock } from '../ports';

/** A clock that stands still until a test moves it. */
export class FakeClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

/** Builds task file text from frontmatter lines (written as given) and an optional body. */
export function taskFileText(frontmatter: Record<string, string | number>, body = ''): string {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

/** Writes a file in the board folder at a `/`-separated relative path, creating its folder. */
export async function writeBoardFile(boardPath: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(boardPath, ...relativePath.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

/** Reads a file in the board folder at a `/`-separated relative path. */
export function readBoardFile(boardPath: string, relativePath: string): Promise<string> {
  return readFile(path.join(boardPath, ...relativePath.split('/')), 'utf8');
}

/** The exact bytes and modification time of a file, to prove the app never wrote it. */
export async function fileState(filePath: string): Promise<{ content: string; mtimeMs: number }> {
  const [content, stats] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
  return { content, mtimeMs: stats.mtimeMs };
}

/** Resolves with the first snapshot the service emits that satisfies `predicate`. */
export function waitForSnapshot(
  service: BoardService,
  predicate: (snapshot: BoardSnapshot) => boolean,
  timeoutMs = 2_000,
): Promise<BoardSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`No matching snapshot within ${timeoutMs} ms.`));
    }, timeoutMs);
    const unsubscribe = service.onChange((snapshot) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(snapshot);
    });
  });
}
