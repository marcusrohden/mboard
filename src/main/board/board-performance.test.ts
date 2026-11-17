import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COLUMNS } from '../../domain';
import { FakeClock } from '../test-support/board-test-kit';
import { inertFolderWatch } from '../test-support/folder-watching';
import { createTemporaryFolder, removeTemporaryFolder } from '../test-support/temporary-folder';
import { FolderTrash } from '../trash/folder-trash';
import { FileBoardService } from './board-service';

const TASK_COUNT = 1_000;
const LOAD_BUDGET_MS = 500;

function realisticTaskFile(index: number): string {
  const day = String((index % 28) + 1).padStart(2, '0');
  return [
    '---',
    `title: "Task number ${index} for the performance check"`,
    `status: ${COLUMNS[index % COLUMNS.length]}`,
    `project: Project ${index % 17}`,
    `due: 2026-12-${day}`,
    `created: 2026-11-${day}T09:30:00`,
    `updated: 2026-11-${day}T14:03:12`,
    `order: ${index}`,
    'tags:',
    '  - work',
    '---',
    '',
    '## Description',
    '',
    'The staging pipeline fails at the asset step since Friday. '.repeat(4),
    '',
    '## Comments',
    '',
    `### 2026-11-${day} 14:02`,
    '',
    'Asked the client for the staging credentials.',
    '',
    `### 2026-11-${day} 15:10`,
    '',
    'They sent them over; checking now.',
    '',
    '## History',
    '',
    `- 2026-11-${day} 09:30 — Created in To do`,
    `- 2026-11-${day} 10:05 — Moved from To do to In progress`,
    `- 2026-11-${day} 14:02 — Comment added`,
    `- 2026-11-${day} 14:03 — Moved from In progress to With client`,
    '',
  ].join('\n');
}

describe('loading a large board', () => {
  let root: string;
  let service: FileBoardService;

  beforeEach(async () => {
    root = await createTemporaryFolder('mboard-performance-');
    const tasksFolder = path.join(root, 'Board', 'tasks');
    await mkdir(tasksFolder, { recursive: true });
    await Promise.all(
      Array.from({ length: TASK_COUNT }, (_, index) =>
        writeFile(path.join(tasksFolder, `Task ${index}.md`), realisticTaskFile(index)),
      ),
    );
    const clock = new FakeClock(new Date(2026, 10, 16, 9, 30, 0));
    service = new FileBoardService({
      clock,
      trash: new FolderTrash(path.join(root, 'Trash')),
      watchFolder: inertFolderWatch,
    });
  });

  afterEach(async () => {
    await service.close();
    await removeTemporaryFolder(root);
  });

  it(`opens ${TASK_COUNT} tasks in under ${LOAD_BUDGET_MS} ms`, async () => {
    const started = performance.now();
    await service.open(path.join(root, 'Board'));
    const elapsed = performance.now() - started;

    expect(service.snapshot().tasks).toHaveLength(TASK_COUNT);
    expect(service.snapshot().unreadable).toEqual([]);
    expect(elapsed).toBeLessThan(LOAD_BUDGET_MS);
  });
});
