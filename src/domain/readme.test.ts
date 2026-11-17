import { describe, expect, it } from 'vitest';
import { buildBoardReadme } from './readme';

describe('buildBoardReadme', () => {
  const readme = buildBoardReadme('Work board');

  it('names the board and the folder layout', () => {
    expect(readme.startsWith('# Work board\n')).toBe(true);
    expect(readme).toContain('tasks/');
    expect(readme).toContain('archive/');
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
    expect(readme).toContain("Leave the `<!-- mboard-ledger … -->` comments alone");
    expect(readme).toContain("Your own edits aren't in the ledger");
  });

  it('ends with a single newline', () => {
    expect(readme.endsWith('.\n')).toBe(true);
  });
});
