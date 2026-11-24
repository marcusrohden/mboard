import { describe, expect, it } from 'vitest';
import { isOpenableLink } from './links';

describe('isOpenableLink', () => {
  it.each([
    'https://example.com/a?b=c',
    'http://localhost:3000',
    'mailto:sam@example.com',
    'obsidian://open?vault=Work&file=Notes',
    'HTTPS://EXAMPLE.COM',
  ])('opens %s', (url) => {
    expect(isOpenableLink(url)).toBe(true);
  });

  it.each([
    '',
    'notes/Plan.md',
    '#heading',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hi',
    'ftp://example.com',
    'vscode://file/a',
  ])('refuses %o', (url) => {
    expect(isOpenableLink(url)).toBe(false);
  });
});
