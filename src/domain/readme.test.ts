import { describe, expect, it } from 'vitest';
import { buildBoardReadme } from './readme';

describe('buildBoardReadme', () => {
  const readme = buildBoardReadme('Work board');

  it('names the board and the folder layout', () => {
    expect(readme.startsWith('# Work board\n')).toBe(true);
    expect(readme).toContain('tasks/');
    expect(readme).toContain('archive/');
    expect(readme).toContain('projects.md');
  });

  it('explains that tasks are grouped in one level of project folders, decided by the project property', () => {
    expect(readme).toContain('│   ├── Acme website/   tasks of the project Acme website');
    expect(readme).toContain("Put a new task file in its project's folder, or directly in `tasks/` when it has none.");
    expect(readme).toContain('The `project` property, not the folder, decides the project.');
    expect(readme).not.toContain('not in a subfolder');
  });

  it('explains project colours in projects.md', () => {
    expect(readme).toContain('## Project colours');
    expect(readme).toContain('red, orange, amber, green, teal, blue, indigo, purple, pink or brown');
  });

  it('documents every frontmatter property, and no responsibility', () => {
    for (const key of ['title', 'status', 'project', 'due', 'created', 'updated', 'archived', 'order']) {
      expect(readme).toContain(`| \`${key}\` |`);
    }
    expect(readme.toLowerCase()).not.toContain('responsibility');
  });

  it('lists the five status values in board order', () => {
    expect(readme).toContain('`To do`, `In progress`, `Internal`, `With client` or `Done`');
  });

  it('explains what Internal and With client mean', () => {
    expect(readme).toContain('`Internal` means the task is waiting on someone in my organisation');
    expect(readme).toContain('`With client` means it is waiting on the client');
  });

  it('documents the body sections', () => {
    for (const text of ['## Description', '## Comments', '## History']) {
      expect(readme).toContain(text);
    }
  });

  it('asks agents to leave the ledger comments alone and says their edits are not in the ledger', () => {
    expect(readme).toContain('<!-- mboard-ledger');
    expect(readme).toContain('Leave the `<!-- mboard-ledger … -->` comments alone');
    expect(readme).toContain("Your own edits aren't in the ledger");
  });

  it('ends with a single newline', () => {
    expect(readme.endsWith('.\n')).toBe(true);
  });
});
