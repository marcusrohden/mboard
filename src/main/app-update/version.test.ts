import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  formatVersion,
  isNewerVersion,
  parseVersion,
} from './version';

describe('parseVersion', () => {
  it.each([
    ['0.1.0', { major: 0, minor: 1, patch: 0 }],
    ['v0.2.0', { major: 0, minor: 2, patch: 0 }],
    ['12.30.456', { major: 12, minor: 30, patch: 456 }],
    [' v1.0.0 ', { major: 1, minor: 0, patch: 0 }],
  ])('reads %j', (text, expected) => {
    expect(parseVersion(text)).toEqual(expected);
  });

  it.each([
    '',
    'v',
    '1.0',
    '1.0.0.0',
    '01.0.0',
    '1.0.0-beta.1',
    '1.0.0+build',
    'V1.0.0',
    'version 1.0.0',
    'x.y.z',
  ])('rejects %j', (text) => {
    expect(parseVersion(text)).toBeNull();
  });
});

describe('formatVersion', () => {
  it('writes X.Y.Z without a leading v', () => {
    expect(formatVersion({ major: 0, minor: 10, patch: 2 })).toBe('0.10.2');
  });
});

describe('compareVersions', () => {
  const version = (text: string) => {
    const parsed = parseVersion(text);
    if (parsed === null) throw new Error(`Not a version: ${text}`);
    return parsed;
  };

  it('compares each part as a number, major first', () => {
    expect(
      compareVersions(version('0.10.0'), version('0.9.0')),
    ).toBeGreaterThan(0);
    expect(
      compareVersions(version('1.0.0'), version('0.99.99')),
    ).toBeGreaterThan(0);
    expect(compareVersions(version('0.2.1'), version('0.2.10'))).toBeLessThan(
      0,
    );
    expect(compareVersions(version('v0.2.0'), version('0.2.0'))).toBe(0);
  });

  it('calls a version newer only when it is strictly greater', () => {
    expect(isNewerVersion(version('0.2.0'), version('0.1.0'))).toBe(true);
    expect(isNewerVersion(version('0.1.0'), version('0.1.0'))).toBe(false);
    expect(isNewerVersion(version('0.1.0'), version('0.2.0'))).toBe(false);
  });
});
