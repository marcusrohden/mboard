import { describe, expect, it } from 'vitest';
import { fileNameForTitle, isSameFileName, projectFolderName, sanitiseTitle, uniqueFileName } from './fileName';

describe('sanitiseTitle', () => {
  it('leaves an ordinary title alone', () => {
    expect(sanitiseTitle('Fix login bug')).toBe('Fix login bug');
  });

  it.each(['/', '\\', ':', '*', '?', '"', '<', '>', '|', '#', '^', '[', ']'])('drops %s', (character) => {
    expect(sanitiseTitle(`a${character}b`)).toBe('ab');
  });

  it('drops control characters', () => {
    expect(sanitiseTitle('a\u0000b\u0007c\u007fd')).toBe('abcd');
  });

  it('collapses whitespace, including newlines and tabs, and trims', () => {
    expect(sanitiseTitle('  Fix \t the\n\nbug  ')).toBe('Fix the bug');
  });

  it('collapses the gap left by a dropped character', () => {
    expect(sanitiseTitle('Re: the plan')).toBe('Re the plan');
  });

  it('strips leading dots and trailing dots and spaces', () => {
    expect(sanitiseTitle('...hidden')).toBe('hidden');
    expect(sanitiseTitle('Ends with dots...')).toBe('Ends with dots');
    expect(sanitiseTitle('. . trailing . .')).toBe('trailing');
  });

  it('NFC-normalises', () => {
    expect(sanitiseTitle('Café')).toBe('Café');
  });

  it('cuts to 100 characters and strips any dot or space the cut exposes', () => {
    expect(sanitiseTitle('a'.repeat(150))).toHaveLength(100);
    expect(sanitiseTitle(`${'a'.repeat(99)} b`)).toBe('a'.repeat(99));
  });

  it('does not split a character made of two UTF-16 units', () => {
    const cut = sanitiseTitle('\u{1F600}'.repeat(150));
    expect(Array.from(cut)).toHaveLength(100);
  });

  it.each(['', '   ', '...', '///', ':?*'])('falls back to Untitled for %j', (title) => {
    expect(sanitiseTitle(title)).toBe('Untitled');
  });
});

describe('fileNameForTitle', () => {
  it('adds .md', () => {
    expect(fileNameForTitle('Fix login bug')).toBe('Fix login bug.md');
    expect(fileNameForTitle('')).toBe('Untitled.md');
  });
});

describe('uniqueFileName', () => {
  it('returns the name when it is free', () => {
    expect(uniqueFileName('Fix login bug.md', ['Other.md'])).toBe('Fix login bug.md');
  });

  it('adds 2, 3 and so on on a clash, ignoring case', () => {
    expect(uniqueFileName('Fix login bug.md', ['fix LOGIN bug.md'])).toBe('Fix login bug 2.md');
    expect(uniqueFileName('Fix login bug.md', ['Fix login bug.md', 'Fix login bug 2.md'])).toBe('Fix login bug 3.md');
  });

  it('treats canonically equivalent Unicode names as a clash', () => {
    expect(uniqueFileName('Café.md', ['Café.md'])).toBe('Café 2.md');
  });

  it('lets a file keep its own name', () => {
    expect(uniqueFileName('Fix login bug.md', ['Fix login bug.md'], 'Fix login bug.md')).toBe('Fix login bug.md');
    expect(uniqueFileName('FIX LOGIN BUG.md', ['Fix login bug.md'], 'Fix login bug.md')).toBe('FIX LOGIN BUG.md');
  });

  it('still avoids other files when renaming', () => {
    expect(uniqueFileName('B.md', ['A.md', 'B.md'], 'A.md')).toBe('B 2.md');
  });

  it('accepts any iterable of names', () => {
    expect(uniqueFileName('A.md', new Set(['A.md']))).toBe('A 2.md');
  });
});

describe('projectFolderName', () => {
  it('uses the project name as it is when it is safe', () => {
    expect(projectFolderName('Acme website')).toBe('Acme website');
  });

  it('cleans the name the way a title is cleaned', () => {
    expect(projectFolderName('  Acme / Beta: v2  ')).toBe('Acme Beta v2');
    expect(projectFolderName('..hidden')).toBe('hidden');
  });

  it('is null for no project, and for a name with nothing safe left, instead of an Untitled folder', () => {
    expect(projectFolderName(null)).toBeNull();
    expect(projectFolderName('???')).toBeNull();
    expect(projectFolderName(' . ')).toBeNull();
  });
});

describe('isSameFileName', () => {
  it('ignores case and Unicode normalisation, as a macOS volume does', () => {
    expect(isSameFileName('Acme', 'acme')).toBe(true);
    expect(isSameFileName('Caf\u00e9', 'Cafe\u0301')).toBe(true);
    expect(isSameFileName('Acme', 'Acme 2')).toBe(false);
  });
});
