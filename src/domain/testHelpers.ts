import type { Task, TaskDocument } from './model';
import type { FileFallback } from './taskFile';

export const FALLBACK: FileFallback = {
  fileName: 'Fallback title.md',
  birthtime: new Date(2026, 0, 2, 3, 4, 5),
  mtime: new Date(2026, 5, 7, 8, 9, 10),
};

export function makeDocument(overrides: Partial<TaskDocument> = {}): TaskDocument {
  return {
    title: 'Sample task',
    status: 'To do',
    rawStatus: null,
    responsibility: 'Me',
    rawResponsibility: null,
    project: null,
    due: null,
    created: '2026-11-16T09:30:00',
    updated: '2026-11-16T09:30:00',
    archivedAt: null,
    order: null,
    description: '',
    comments: [],
    history: [{ at: '2026-11-16 09:30', text: 'Created in To do' }],
    unknownFrontmatter: [],
    ...overrides,
  };
}

let nextId = 1;

export function makeTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? `tasks/Task ${nextId++}.md`;
  return {
    id,
    title: id.replace(/^tasks\/|\.md$/g, ''),
    status: 'To do',
    responsibility: 'Me',
    project: null,
    due: null,
    created: '2026-11-01T09:00:00',
    updated: '2026-11-01T09:00:00',
    archivedAt: null,
    isArchived: false,
    order: null,
    description: '',
    comments: [],
    history: [],
    ...overrides,
  };
}
