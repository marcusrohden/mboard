import { describe, expect, it } from 'vitest';
import {
  nextVersion,
  parseVersionTag,
  releaseNotes,
  withChangelogEntry,
  withVersion,
  type ReleaseCommit,
} from './release.mjs';

const REPOSITORY = 'marcusrohden/mboard';

function commit(subject: string, body = '', hash = 'c34b9dcd3523af6591ff610fc667445b419c5a6c'): ReleaseCommit {
  return { hash, subject, body };
}

describe('parseVersionTag', () => {
  it('reads a vX.Y.Z tag', () => {
    expect(parseVersionTag('v0.2.2')).toEqual({ major: 0, minor: 2, patch: 2 });
  });

  it.each(['0.2.2', 'v0.2', 'v0.2.2-beta.1', 'release-0.2.2'])('refuses %s', (tag) => {
    expect(() => parseVersionTag(tag)).toThrow(`"${tag}" isn't a vX.Y.Z release tag.`);
  });
});

describe('nextVersion', () => {
  const current = { major: 0, minor: 2, patch: 2 };

  it('releases a patch for a fix', () => {
    expect(nextVersion(current, [commit('fix: keep the drawer open (#26)')])).toEqual({ major: 0, minor: 2, patch: 3 });
  });

  it('releases a minor version for a feature, whatever else came with it', () => {
    const commits = [commit('fix: one (#26)'), commit('feat(updates): two (#27)'), commit('chore: three')];
    expect(nextVersion(current, commits)).toEqual({ major: 0, minor: 3, patch: 0 });
  });

  it('releases nothing for chores, docs, ci or anything that is not a conventional commit', () => {
    const commits = [
      commit('chore(release): 0.2.2'),
      commit('docs: explain releases'),
      commit('ci: release on every merge to main (#28)'),
      commit('Merge pull request #19 from marcusrohden/mvp'),
    ];
    expect(nextVersion(current, commits)).toBeNull();
  });

  it('treats a breaking change as a minor version before 1.0, and a major one after', () => {
    const breaking = [commit('feat!: drop the old board format (#29)')];
    expect(nextVersion(current, breaking)).toEqual({ major: 0, minor: 3, patch: 0 });
    expect(nextVersion({ major: 1, minor: 4, patch: 2 }, breaking)).toEqual({ major: 2, minor: 0, patch: 0 });
  });

  it('reads a BREAKING CHANGE footer at the start of a line, but not the words elsewhere', () => {
    const footer = commit('fix: rename the board file (#30)', 'Details.\n\nBREAKING CHANGE: boards need moving.');
    const mention = commit(
      'fix: explain why there is no BREAKING CHANGE: here (#31)',
      'Says BREAKING CHANGE: in passing.',
    );
    expect(nextVersion({ major: 1, minor: 0, patch: 0 }, [footer])).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(nextVersion({ major: 1, minor: 0, patch: 0 }, [mention])).toEqual({ major: 1, minor: 0, patch: 1 });
  });
});

describe('releaseNotes', () => {
  it('lists features and fixes with links to their pull requests and commits', () => {
    const notes = releaseNotes({
      version: { major: 0, minor: 3, patch: 0 },
      previousTag: 'v0.2.2',
      date: '2026-11-17',
      repository: REPOSITORY,
      commits: [
        commit('feat: show download progress as a percentage while updating (#25)', '', 'a'.repeat(40)),
        commit('chore(release): 0.2.2', '', 'b'.repeat(40)),
        commit('fix(drawer): keep focus out from under it', '', 'c'.repeat(40)),
      ],
    });
    expect(notes).toBe(
      [
        '## [0.3.0](https://github.com/marcusrohden/mboard/compare/v0.2.2...v0.3.0) (2026-11-17)',
        '',
        '### Features',
        '',
        `* show download progress as a percentage while updating ([#25](https://github.com/marcusrohden/mboard/pull/25)) ([aaaaaaa](https://github.com/marcusrohden/mboard/commit/${'a'.repeat(40)}))`,
        '',
        '### Bug Fixes',
        '',
        `* **drawer:** keep focus out from under it ([ccccccc](https://github.com/marcusrohden/mboard/commit/${'c'.repeat(40)}))`,
        '',
      ].join('\n'),
    );
  });

  it('puts breaking changes first', () => {
    const notes = releaseNotes({
      version: { major: 0, minor: 3, patch: 0 },
      previousTag: 'v0.2.2',
      date: '2026-11-17',
      repository: REPOSITORY,
      commits: [commit('feat!: drop the old board format (#29)', '', 'd'.repeat(40))],
    });
    expect(notes.split('\n').slice(2, 5)).toEqual([
      '### ⚠ BREAKING CHANGES',
      '',
      `* drop the old board format ([#29](https://github.com/marcusrohden/mboard/pull/29)) ([ddddddd](https://github.com/marcusrohden/mboard/commit/${'d'.repeat(40)}))`,
    ]);
  });
});

describe('withVersion', () => {
  it('changes only the top-level version, keeping the file as it is otherwise', () => {
    const before = '{\n  "name": "mboard",\n  "version": "0.2.2",\n  "devDependencies": {\n    "x": "1.0.0"\n  }\n}\n';
    expect(withVersion(before, '0.3.0')).toBe(before.replace('"version": "0.2.2"', '"version": "0.3.0"'));
  });

  it('refuses a file without a version', () => {
    expect(() => withVersion('{\n  "name": "mboard"\n}\n', '0.3.0')).toThrow('package.json has no version to change.');
  });
});

describe('withChangelogEntry', () => {
  it('adds the entry above the newest one, under the heading', () => {
    const before = '# Changelog\n\n## [0.2.2](link) (2026-11-17)\n\n### Bug Fixes\n\n* one\n';
    expect(withChangelogEntry(before, '## [0.3.0](link) (2026-11-18)\n\n### Features\n\n* two\n')).toBe(
      '# Changelog\n\n## [0.3.0](link) (2026-11-18)\n\n### Features\n\n* two\n\n## [0.2.2](link) (2026-11-17)\n\n### Bug Fixes\n\n* one\n',
    );
  });

  it('starts a changelog when there is none', () => {
    expect(withChangelogEntry('', '## [0.3.0](link) (2026-11-18)\n')).toBe(
      '# Changelog\n\n## [0.3.0](link) (2026-11-18)\n',
    );
  });
});
