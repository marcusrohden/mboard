import { describe, expect, it } from 'vitest';
import {
  PROJECT_COLOURS,
  parseProjectsFile,
  projectColourIndex,
  projectColourOf,
  withProjectColour,
} from './projectColours';

describe('parseProjectsFile', () => {
  it('reads each project name with its palette colour', () => {
    const content = '---\ncolours:\n  Acme website: teal\n  "Internal tools": purple\n---\n\n# Projects\n';
    expect(parseProjectsFile(content)).toEqual({
      kind: 'ok',
      colours: { 'Acme website': 'teal', 'Internal tools': 'purple' },
    });
  });

  it('skips colours outside the palette, names that are not text, and tidies spacing in names', () => {
    const content = '---\ncolours:\n  Acme: magenta\n  12: red\n  "  Big   client ": blue\n---\n';
    expect(parseProjectsFile(content)).toEqual({ kind: 'ok', colours: { 'Big client': 'blue' } });
  });

  it('has no colours without frontmatter or without a colours mapping', () => {
    expect(parseProjectsFile('# Projects\n')).toEqual({ kind: 'ok', colours: {} });
    expect(parseProjectsFile('---\nowner: me\n---\n')).toEqual({ kind: 'ok', colours: {} });
    expect(parseProjectsFile('---\ncolours: teal\n---\n')).toEqual({ kind: 'ok', colours: {} });
  });

  it('is unreadable when the frontmatter is not valid YAML', () => {
    const result = parseProjectsFile('---\ncolours: [unclosed\n---\n');
    expect(result.kind).toBe('unreadable');
  });

  it('keeps a key named like an object property as an ordinary project', () => {
    expect(parseProjectsFile('---\ncolours:\n  __proto__: red\n---\n')).toEqual({
      kind: 'ok',
      colours: { ['__proto__']: 'red' },
    });
  });
});

describe('projectColourOf', () => {
  it('matches the project name ignoring case', () => {
    const index = projectColourIndex({ 'Acme Website': 'teal' });
    expect(projectColourOf('acme website', index)).toBe('teal');
    expect(projectColourOf('Other', index)).toBeNull();
    expect(projectColourOf(null, index)).toBeNull();
  });
});

describe('withProjectColour', () => {
  it('starts a new file with the colour and an explanation listing the palette', () => {
    const text = withProjectColour(null, 'Acme website', 'teal');
    expect(text.startsWith('---\ncolours:\n  Acme website: teal\n---\n')).toBe(true);
    expect(text).toContain(PROJECT_COLOURS.join(', '));
    expect(parseProjectsFile(text)).toEqual({ kind: 'ok', colours: { 'Acme website': 'teal' } });
  });

  it('replaces an entry spelt in another case and keeps everything else', () => {
    const content = '---\n# kept comment\nowner: me\ncolours:\n  ACME: red\n  Beta: blue\n---\n\nMy notes.\n';
    const text = withProjectColour(content, 'Acme', 'green');
    expect(text).toContain('# kept comment');
    expect(text).toContain('owner: me');
    expect(text.endsWith('\nMy notes.\n')).toBe(true);
    expect(parseProjectsFile(text)).toEqual({ kind: 'ok', colours: { Beta: 'blue', Acme: 'green' } });
  });

  it('removes a colour', () => {
    const text = withProjectColour('---\ncolours:\n  Acme: red\n---\n', 'acme', null);
    expect(parseProjectsFile(text)).toEqual({ kind: 'ok', colours: {} });
  });

  it('adds frontmatter to a file without any', () => {
    const text = withProjectColour('Just notes.\n', 'Acme', 'pink');
    expect(text).toBe('---\ncolours:\n  Acme: pink\n---\nJust notes.\n');
  });

  it('refuses frontmatter that is not valid YAML', () => {
    expect(() => withProjectColour('---\ncolours: [unclosed\n---\n', 'Acme', 'red')).toThrow(
      "projects.md isn't valid YAML.",
    );
  });
});
