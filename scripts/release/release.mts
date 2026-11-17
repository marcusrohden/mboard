import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * Works out and applies a release of mboard from the conventional commits merged into `main` since the
 * last `vX.Y.Z` tag (ADR 0008). Runs in `release.yml` with Node's type stripping:
 *
 * - `plan --notes-file <path>` writes `release`, `version` and `tag` to the step outputs and the release
 *   notes to `<path>`, or `release=false` when nothing since the last tag calls for a release.
 * - `apply <version> --notes-file <path>` sets that version in `package.json` and adds the notes to
 *   `CHANGELOG.md` in the current folder.
 */

export interface ReleaseCommit {
  hash: string;
  subject: string;
  body: string;
}

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

type ReleaseLevel = 'major' | 'minor' | 'patch';

interface ConventionalCommit {
  hash: string;
  type: string;
  scope: string | null;
  isBreaking: boolean;
  description: string;
  pullRequest: number | null;
}

export interface ReleaseNotesInput {
  version: Version;
  previousTag: string;
  commits: readonly ReleaseCommit[];
  date: string;
  repository: string;
}

const VERSION_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CONVENTIONAL_SUBJECT = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<description>.+)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;
const PULL_REQUEST_SUFFIX = / \(#(\d+)\)$/;
const TOP_LEVEL_VERSION = /^( {2}"version": ")[^"]*(")/m;
const CHANGELOG_HEADING = '# Changelog\n\n';
const LEVEL_RANK: Record<ReleaseLevel, number> = { patch: 1, minor: 2, major: 3 };
const DEFAULT_REPOSITORY = 'marcusrohden/mboard';
const FIELD = '\x1f';
const RECORD = '\x1e';

/**
 * Reads a release tag such as `v0.2.2`.
 *
 * @throws Error when the tag isn't a plain `vX.Y.Z`.
 */
export function parseVersionTag(tag: string): Version {
  const match = VERSION_TAG.exec(tag);
  if (match === null) throw new Error(`"${tag}" isn't a vX.Y.Z release tag.`);
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  return { major, minor, patch };
}

/** Writes a version as `X.Y.Z`. */
export function formatVersion({ major, minor, patch }: Version): string {
  return `${major}.${minor}.${patch}`;
}

function parseCommit({ hash, subject, body }: ReleaseCommit): ConventionalCommit | null {
  const groups = CONVENTIONAL_SUBJECT.exec(subject)?.groups;
  if (groups === undefined) return null;
  const pullRequest = PULL_REQUEST_SUFFIX.exec(groups['description']!);
  return {
    hash,
    type: groups['type']!,
    scope: groups['scope'] ?? null,
    isBreaking: groups['bang'] === '!' || BREAKING_FOOTER.test(body),
    description: pullRequest === null ? groups['description']! : groups['description']!.slice(0, pullRequest.index),
    pullRequest: pullRequest === null ? null : Number(pullRequest[1]),
  };
}

function levelOf(commit: ConventionalCommit): ReleaseLevel | null {
  if (commit.isBreaking) return 'major';
  if (commit.type === 'feat') return 'minor';
  if (commit.type === 'fix') return 'patch';
  return null;
}

/**
 * The version these commits call for after `current`, or `null` when none of them is a feature, a fix
 * or a breaking change. The highest call wins. Before 1.0, a breaking change raises the minor version.
 */
export function nextVersion(current: Version, commits: readonly ReleaseCommit[]): Version | null {
  const levels = commits
    .map(parseCommit)
    .filter((commit): commit is ConventionalCommit => commit !== null)
    .map(levelOf)
    .filter((level): level is ReleaseLevel => level !== null);
  if (levels.length === 0) return null;
  const highest = levels.reduce((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a));
  const level = highest === 'major' && current.major === 0 ? 'minor' : highest;
  if (level === 'major') return { major: current.major + 1, minor: 0, patch: 0 };
  if (level === 'minor') return { major: current.major, minor: current.minor + 1, patch: 0 };
  return { ...current, patch: current.patch + 1 };
}

function noteLine(commit: ConventionalCommit, repository: string): string {
  const base = `https://github.com/${repository}`;
  const scope = commit.scope === null ? '' : `**${commit.scope}:** `;
  const pullRequest =
    commit.pullRequest === null ? '' : ` ([#${commit.pullRequest}](${base}/pull/${commit.pullRequest}))`;
  return `* ${scope}${commit.description}${pullRequest} ([${commit.hash.slice(0, 7)}](${base}/commit/${commit.hash}))`;
}

function section(title: string, commits: readonly ConventionalCommit[], repository: string): string[] {
  if (commits.length === 0) return [];
  return [`### ${title}`, '', ...commits.map((commit) => noteLine(commit, repository)), ''];
}

/**
 * The release's notes, in the shape `CHANGELOG.md` already uses: breaking changes, features, then bug
 * fixes, each linking its pull request and commit. Other commits are left out.
 */
export function releaseNotes({ version, previousTag, commits, date, repository }: ReleaseNotesInput): string {
  const parsed = commits.map(parseCommit).filter((commit): commit is ConventionalCommit => commit !== null);
  const tag = `v${formatVersion(version)}`;
  const heading = `## [${formatVersion(version)}](https://github.com/${repository}/compare/${previousTag}...${tag}) (${date})`;
  return [
    heading,
    '',
    ...section(
      '⚠ BREAKING CHANGES',
      parsed.filter((commit) => commit.isBreaking),
      repository,
    ),
    ...section(
      'Features',
      parsed.filter((commit) => commit.type === 'feat'),
      repository,
    ),
    ...section(
      'Bug Fixes',
      parsed.filter((commit) => commit.type === 'fix'),
      repository,
    ),
  ].join('\n');
}

/**
 * `package.json` with its top-level `version` set, and nothing else changed.
 *
 * @throws Error when the file has no top-level version.
 */
export function withVersion(packageJson: string, version: string): string {
  if (!TOP_LEVEL_VERSION.test(packageJson)) throw new Error('package.json has no version to change.');
  return packageJson.replace(TOP_LEVEL_VERSION, `$1${version}$2`);
}

/** `CHANGELOG.md` with `notes` added as its newest entry, under the heading. */
export function withChangelogEntry(changelog: string, notes: string): string {
  const entries = changelog.startsWith(CHANGELOG_HEADING) ? changelog.slice(CHANGELOG_HEADING.length) : changelog;
  return `${CHANGELOG_HEADING}${notes}${entries === '' ? '' : `\n${entries}`}`;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function latestReleaseTag(): string {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*', 'HEAD').trim();
  } catch {
    throw new Error('No vX.Y.Z tag is reachable from HEAD, so there is no release to count from.');
  }
}

function commitsSince(tag: string): ReleaseCommit[] {
  return git('log', `--format=%H${FIELD}%s${FIELD}%b${RECORD}`, `${tag}..HEAD`)
    .split(RECORD)
    .map((record) => record.trim())
    .filter((record) => record !== '')
    .map((record) => {
      const [hash = '', subject = '', body = ''] = record.split(FIELD);
      return { hash, subject, body };
    });
}

function writeOutputs(outputs: Record<string, string>): void {
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${value}\n`);
  const outputFile = process.env['GITHUB_OUTPUT'];
  if (outputFile === undefined || outputFile === '') process.stdout.write(lines.join(''));
  else appendFileSync(outputFile, lines.join(''));
}

function plan(notesFile: string): void {
  const previousTag = latestReleaseTag();
  const commits = commitsSince(previousTag);
  const version = nextVersion(parseVersionTag(previousTag), commits);
  if (version === null) {
    console.log(`Nothing since ${previousTag} is a feature, a fix or a breaking change, so there is no release.`);
    writeOutputs({ release: 'false' });
    return;
  }
  const notes = releaseNotes({
    version,
    previousTag,
    commits,
    date: new Date().toISOString().slice(0, 10),
    repository: process.env['GITHUB_REPOSITORY'] ?? DEFAULT_REPOSITORY,
  });
  writeFileSync(notesFile, notes);
  console.log(`Releasing ${formatVersion(version)} after ${previousTag}:\n\n${notes}`);
  writeOutputs({ release: 'true', version: formatVersion(version), tag: `v${formatVersion(version)}` });
}

function apply(version: string, notesFile: string): void {
  parseVersionTag(`v${version}`);
  writeFileSync('package.json', withVersion(readFileSync('package.json', 'utf8'), version));
  const changelog = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : '';
  writeFileSync('CHANGELOG.md', withChangelogEntry(changelog, readFileSync(notesFile, 'utf8')));
}

function main(argv: string[]): void {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { 'notes-file': { type: 'string' } },
  });
  const [command, version] = positionals;
  const notesFile = values['notes-file'];
  if (notesFile === undefined) throw new Error('--notes-file is required.');
  if (command === 'plan') return plan(notesFile);
  if (command === 'apply' && version !== undefined) return apply(version, notesFile);
  throw new Error('Usage: release.mts plan --notes-file <path> | release.mts apply <version> --notes-file <path>');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
