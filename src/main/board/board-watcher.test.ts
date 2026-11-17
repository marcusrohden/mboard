import { describe, expect, it } from 'vitest';
import { isRelevantBoardChange } from './board-watcher';

describe('isRelevantBoardChange', () => {
  it.each([
    ['tasks/Fix login bug.md', true],
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
    ['notes/Idea.md', false],
    ['Board', false],
    ['', false],
  ])('%j is relevant: %s', (relativePath, expected) => {
    expect(isRelevantBoardChange(relativePath)).toBe(expected);
  });
});
