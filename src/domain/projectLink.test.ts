import { describe, expect, it } from 'vitest';
import {
  isProjectLink,
  projectLinkFor,
  projectNoteFileName,
  projectNotesLinkPath,
  projectSpellingAfterUpdate,
  projectValueToWrite,
  readProjectValue,
} from './projectLink';

describe('readProjectValue', () => {
  it('reads a plain name, tidying its spacing, and keeps the spelling as written', () => {
    expect(readProjectValue('  Acme   website ')).toEqual({ project: 'Acme website', raw: '  Acme   website ' });
    expect(readProjectValue(2026)).toEqual({ project: '2026', raw: '2026' });
  });

  it('names the project of a link after its note, spelt as the display text while that names the note', () => {
    expect(readProjectValue('[[Work/mboard/projects/Acme web|Acme: web]]').project).toBe('Acme: web');
    expect(readProjectValue('[[Work/mboard/projects/acme website|Acme Website]]').project).toBe('Acme Website');
    expect(readProjectValue('[[Work/mboard/projects/Acme website]]').project).toBe('Acme website');
    expect(readProjectValue('[[Acme website]]').project).toBe('Acme website');
    expect(readProjectValue('[[Clients/Acme website.md]]').project).toBe('Acme website');
  });

  it('follows a note renamed in Obsidian, which keeps the old display text', () => {
    expect(readProjectValue('[[Work/mboard/projects/Globex|Acme website]]').project).toBe('Globex');
    expect(readProjectValue('[[Clients/Acme Corp|Acme]]').project).toBe('Acme Corp');
  });

  it('ignores a heading or block in the link target and an empty display text', () => {
    expect(readProjectValue('[[Acme website#Notes]]').project).toBe('Acme website');
    expect(readProjectValue('[[Acme website#^block|]]').project).toBe('Acme website');
  });

  it('reads an unquoted link, which YAML parses as a list in a list', () => {
    expect(readProjectValue([['Acme website']])).toEqual({ project: 'Acme website', raw: '[[Acme website]]' });
    expect(readProjectValue([['projects/Acme|Acme']])).toEqual({ project: 'Acme', raw: '[[projects/Acme|Acme]]' });
  });

  it('has no project for empty values, other lists and maps', () => {
    expect(readProjectValue(undefined)).toEqual({ project: null, raw: null });
    expect(readProjectValue('   ')).toEqual({ project: null, raw: null });
    expect(readProjectValue('[[]]')).toEqual({ project: null, raw: null });
    expect(readProjectValue(['Acme', 'Beta'])).toEqual({ project: null, raw: null });
    expect(readProjectValue(new Map([['a', 'b']]))).toEqual({ project: null, raw: null });
  });

  it('reads text that only looks partly like a link as a plain name', () => {
    expect(readProjectValue('[[Acme')).toEqual({ project: '[[Acme', raw: '[[Acme' });
    expect(isProjectLink('[[Acme')).toBe(false);
    expect(isProjectLink(' [[Acme]] ')).toBe(true);
  });
});

describe('projectNotesLinkPath', () => {
  it('is the projects folder inside the board, from the vault root', () => {
    expect(projectNotesLinkPath('Work/mboard')).toBe('Work/mboard/projects');
    expect(projectNotesLinkPath('')).toBe('projects');
    expect(projectNotesLinkPath(null)).toBeNull();
  });

  it('is none for a board whose path would break a link, so links go by note name', () => {
    for (const path of ['Work/Board #2', 'Work/Board ^1', 'Work/[Board]', 'Work/A|B']) {
      expect(projectNotesLinkPath(path)).toBeNull();
    }
  });
});

describe('projectLinkFor', () => {
  it('links to the note in the projects folder with the project name as display text', () => {
    expect(projectLinkFor('Acme website', 'Work/mboard/projects')).toBe(
      '[[Work/mboard/projects/Acme website|Acme website]]',
    );
  });

  it('links by note name alone outside a vault, adding display text only when the names differ', () => {
    expect(projectLinkFor('Acme website', null)).toBe('[[Acme website]]');
    expect(projectLinkFor('Acme / Beta: v2', null)).toBe('[[Acme Beta v2|Acme / Beta: v2]]');
  });

  it('gives no link for a name with nothing left as a note name or that would break the link', () => {
    expect(projectLinkFor('???', 'projects')).toBeNull();
    expect(projectLinkFor('A|B', 'projects')).toBeNull();
    expect(projectLinkFor('Acme [beta]', 'projects')).toBeNull();
  });

  it('writes plain text for a name that a link would read back differently', () => {
    expect(projectLinkFor('notes.md', 'projects')).toBeNull();
    expect(projectValueToWrite('notes.md', null, 'projects')).toBe('notes.md');
  });

  it('reads back as the same project', () => {
    for (const project of ['Acme website', 'Acme / Beta: v2', '2026']) {
      const link = projectLinkFor(project, 'Work/mboard/projects') as string;
      expect(readProjectValue(link).project).toBe(project);
    }
  });
});

describe('projectNoteFileName', () => {
  it('cleans the project name the way a project folder is', () => {
    expect(projectNoteFileName('Acme / Beta: v2')).toBe('Acme Beta v2.md');
    expect(projectNoteFileName('???')).toBeNull();
  });
});

describe('projectValueToWrite', () => {
  it("keeps the file's spelling while it still names the project", () => {
    expect(projectValueToWrite('Acme', 'Acme', 'projects')).toBe('Acme');
    expect(projectValueToWrite('Acme', '[[Clients/Acme]]', 'projects')).toBe('[[Clients/Acme]]');
  });

  it("writes mboard's link once the spelling names another project or is gone", () => {
    expect(projectValueToWrite('Beta', 'Acme', 'projects')).toBe('[[projects/Beta|Beta]]');
    expect(projectValueToWrite('Beta', null, 'projects')).toBe('[[projects/Beta|Beta]]');
  });

  it('writes a plain name when the project cannot be linked, and nothing for no project', () => {
    expect(projectValueToWrite('A|B', null, 'projects')).toBe('A|B');
    expect(projectValueToWrite(null, 'Acme', 'projects')).toBeNull();
  });
});

describe('projectSpellingAfterUpdate', () => {
  it('keeps a link and drops a plain name', () => {
    expect(projectSpellingAfterUpdate('[[Clients/Acme|Acme]]')).toBe('[[Clients/Acme|Acme]]');
    expect(projectSpellingAfterUpdate('[[Clients/Acme Corp]]')).toBe('[[Clients/Acme Corp]]');
    expect(projectSpellingAfterUpdate('Acme')).toBeNull();
    expect(projectSpellingAfterUpdate(null)).toBeNull();
  });

  it('drops a link whose display text no longer names its renamed note', () => {
    expect(projectSpellingAfterUpdate('[[Board/projects/Globex|Acme website]]')).toBeNull();
  });
});
