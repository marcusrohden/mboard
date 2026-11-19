import { describe, expect, it } from 'vitest';
import { parseProjectNote, withNoteColour, withNoteHeading } from './projectNote';

describe('parseProjectNote', () => {
  it('reads a palette colour from the frontmatter', () => {
    expect(parseProjectNote('---\ncolour: teal\nclient: Acme\n---\n# Acme\n')).toEqual({ kind: 'ok', colour: 'teal' });
  });

  it('has no colour without frontmatter or for a colour outside the palette', () => {
    expect(parseProjectNote('# Acme\n')).toEqual({ kind: 'ok', colour: null });
    expect(parseProjectNote('---\ncolour: magenta\n---\n')).toEqual({ kind: 'ok', colour: null });
  });

  it('is unreadable when the frontmatter is not a valid YAML mapping', () => {
    expect(parseProjectNote('---\ncolour: [unclosed\n---\n').kind).toBe('unreadable');
    expect(parseProjectNote('---\n- a list\n---\n').kind).toBe('unreadable');
  });
});

describe('withNoteColour', () => {
  it('starts a new note with the colour, a heading and an explanation', () => {
    const text = withNoteColour(null, 'Acme website', 'blue');
    expect(text.startsWith('---\ncolour: blue\n---\n# Acme website\n')).toBe(true);
    expect(parseProjectNote(text)).toEqual({ kind: 'ok', colour: 'blue' });
  });

  it('starts a new note without frontmatter when it has no colour', () => {
    const text = withNoteColour(null, 'Acme website', null);
    expect(text.startsWith('# Acme website\n')).toBe(true);
    expect(parseProjectNote(text)).toEqual({ kind: 'ok', colour: null });
  });

  it('changes only the colour, keeping other frontmatter, comments and the body', () => {
    const content = '---\n# who pays\nclient: Acme\ncolour: red\n---\n# Acme\n\nMy notes.\n';
    expect(withNoteColour(content, 'Acme', 'green')).toBe(
      '---\n# who pays\nclient: Acme\ncolour: green\n---\n# Acme\n\nMy notes.\n',
    );
  });

  it('adds frontmatter to a note without any, and removes a colour', () => {
    expect(withNoteColour('# Acme\n\nMy notes.\n', 'Acme', 'teal')).toBe(
      '---\ncolour: teal\n---\n# Acme\n\nMy notes.\n',
    );
    expect(withNoteColour('---\ncolour: teal\n---\n# Acme\n', 'Acme', null)).toBe('---\n---\n# Acme\n');
    expect(withNoteColour('---\nclient: Acme\ncolour: teal\n---\n', 'Acme', null)).toBe('---\nclient: Acme\n---\n');
  });

  it('refuses frontmatter it cannot read', () => {
    expect(() => withNoteColour('---\ncolour: [unclosed\n---\n', 'Acme', 'red')).toThrow();
  });
});

describe('withNoteHeading', () => {
  it("renames mboard's heading and keeps everything else", () => {
    const content = '---\ncolour: teal\n---\n# Acme\n\nMy notes about Acme.\n';
    expect(withNoteHeading(content, 'Acme', 'Globex')).toBe(
      '---\ncolour: teal\n---\n# Globex\n\nMy notes about Acme.\n',
    );
    expect(withNoteHeading('\n# Acme\n', 'Acme', 'Globex')).toBe('\n# Globex\n');
    expect(withNoteHeading('# Acme\n', 'acme', 'Globex')).toBe('# Globex\n');
  });

  it('leaves a note whose first line is anything else as it is', () => {
    expect(withNoteHeading('# Acme Corp\n', 'Acme', 'Globex')).toBe('# Acme Corp\n');
    expect(withNoteHeading('Notes first\n# Acme\n', 'Acme', 'Globex')).toBe('Notes first\n# Acme\n');
    expect(withNoteHeading('', 'Acme', 'Globex')).toBe('');
  });
});
