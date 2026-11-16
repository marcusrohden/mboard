import { describe, expect, it } from 'vitest';
import { buildBoardReadme } from './readme';

describe('buildBoardReadme', () => {
  const readme = buildBoardReadme('Work board');

  it('names the board and the folder layout', () => {
    expect(readme.startsWith('# Work board\n')).toBe(true);
    expect(readme).toContain('tasks/');
    expect(readme).toContain('archive/');
  });

  it('documents every frontmatter property', () => {
    for (const key of ['title', 'status', 'responsibility', 'project', 'due', 'created', 'updated', 'archived', 'order']) {
      expect(readme).toContain(`| \`${key}\` |`);
    }
  });

  it('documents the column and responsibility values and the body sections', () => {
    for (const text of ['To do', 'In progress', 'Done', 'Me', 'Client', 'Internal', '## Description', '## Comments', '## History']) {
      expect(readme).toContain(text);
    }
  });

  it('ends with a single newline', () => {
    expect(readme.endsWith('.\n')).toBe(true);
  });
});
