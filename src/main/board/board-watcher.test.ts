import { describe, expect, it } from 'vitest';
import { isRelevantBoardChange } from './board-watcher';

describe('isRelevantBoardChange', () => {
  it.each([
    ['tasks/Fix login bug.md', true],
    ['tasks/Acme website/Fix login bug.md', true],
    ['archive/Acme website', true],
    ['tasks/.drafts/Idea.md', false],
    ['archive/Old.md', true],
    ['tasks', true],
    ['archive', true],
    [null, true],
    ['tasks/.Fix login bug.md.mboard-tmp', false],
    ['tasks/.DS_Store', false],
    ['.obsidian/workspace.json', false],
    ['README.md', false],
    ['projects.md', true],
    ['tasks/projects.md', true],
    ['notes/projects.md', false],
    ['projects', true],
    ['projects/Acme website.md', true],
    ['projects/.Acme website.md.mboard-tmp', false],
    ['projects/Old/Acme.md', false],
    ['notes/Idea.md', false],
    ['Board', false],
    ['', false],
  ])('%j is relevant: %s', (relativePath, expected) => {
    expect(isRelevantBoardChange(relativePath)).toBe(expected);
  });
});
