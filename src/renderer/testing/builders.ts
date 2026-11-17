import type { Task } from '../../shared/contract';

export const TEST_TODAY = '2026-11-16';
export const TEST_NOW = '2026-11-16T10:00:00';

let sequence = 0;

/**
 * Builds a live task in To do, updated today, with every field filled in. Override what a test cares about.
 * The id follows the title, like a real task file, unless `id` is given.
 */
export function buildTask(overrides: Partial<Task> = {}): Task {
  sequence += 1;
  const title = overrides.title ?? `Task ${sequence}`;
  const isArchived = overrides.isArchived ?? false;
  return {
    id: `${isArchived ? 'archive' : 'tasks'}/${title}.md`,
    title,
    status: 'To do',
    project: null,
    due: null,
    created: '2026-11-10T09:00:00',
    updated: TEST_NOW,
    archivedAt: isArchived ? '2026-11-15T12:00:00' : null,
    isArchived,
    order: sequence,
    description: '',
    comments: [],
    history: [{ at: '2026-11-10 09:00', text: 'Created in To do' }],
    ...overrides,
  };
}
