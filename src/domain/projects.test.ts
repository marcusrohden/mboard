import { describe, expect, it } from 'vitest';
import { canonicalProject, normaliseProject, projectSuggestions } from './projects';

describe('normaliseProject', () => {
  it('trims and collapses repeated whitespace', () => {
    expect(normaliseProject('  Acme   website\t ')).toBe('Acme website');
  });

  it('turns empty, blank and missing values into null', () => {
    expect(normaliseProject('')).toBeNull();
    expect(normaliseProject('   ')).toBeNull();
    expect(normaliseProject(null)).toBeNull();
    expect(normaliseProject(undefined)).toBeNull();
  });
});

describe('canonicalProject', () => {
  const known = ['Acme website', 'Bookkeeping'];

  it('uses the existing spelling when the name matches ignoring case', () => {
    expect(canonicalProject('acme WEBSITE', known)).toBe('Acme website');
    expect(canonicalProject('  bookkeeping ', known)).toBe('Bookkeeping');
  });

  it('keeps a new name as typed, once normalised', () => {
    expect(canonicalProject('  New   thing ', known)).toBe('New thing');
  });

  it('prefers the first known spelling when several differ only in case', () => {
    expect(canonicalProject('acme', ['ACME', 'Acme'])).toBe('ACME');
  });

  it('returns null for empty input', () => {
    expect(canonicalProject('  ', known)).toBeNull();
    expect(canonicalProject(null, known)).toBeNull();
  });
});

describe('projectSuggestions', () => {
  const tasks = [
    { project: 'Bookkeeping', updated: '2026-11-10T09:00:00' },
    { project: 'Acme website', updated: '2026-11-12T09:00:00' },
    { project: 'Acme website', updated: '2026-11-01T09:00:00' },
    { project: 'Archived project', updated: '2026-11-15T09:00:00' },
    { project: null, updated: '2026-11-16T09:00:00' },
    { project: 'Zeta', updated: '2026-11-10T09:00:00' },
  ];

  it('lists distinct projects, most recently updated first, ties alphabetical', () => {
    expect(projectSuggestions(tasks)).toEqual(['Archived project', 'Acme website', 'Bookkeeping', 'Zeta']);
  });

  it('uses the latest update of each project', () => {
    const suggestions = projectSuggestions([
      { project: 'Old', updated: '2026-01-01T00:00:00' },
      { project: 'Old', updated: '2026-11-20T00:00:00' },
      { project: 'New', updated: '2026-11-10T00:00:00' },
    ]);
    expect(suggestions).toEqual(['Old', 'New']);
  });

  it('filters by a case-insensitive substring', () => {
    expect(projectSuggestions(tasks, 'WEB')).toEqual(['Acme website']);
    expect(projectSuggestions(tasks, 'k')).toEqual(['Bookkeeping']);
    expect(projectSuggestions(tasks, 'nothing')).toEqual([]);
  });

  it('treats an empty or blank query as no filter', () => {
    expect(projectSuggestions(tasks, '  ')).toHaveLength(4);
  });
});
