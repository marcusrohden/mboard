/** A release version: `major.minor.patch`, as in the release tag `v0.2.0`. */
export interface AppVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Reads a plain release version, `X.Y.Z` or `vX.Y.Z`. Pre-release and build suffixes aren't release
 * versions, so they read as `null`, as does anything else.
 */
export function parseVersion(text: string): AppVersion | null {
  const match = VERSION_PATTERN.exec(text.trim());
  if (match === null) return null;
  const [major, minor, patch] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  return { major, minor, patch };
}

/** Writes a version as `X.Y.Z`, without the tag's leading `v`. */
export function formatVersion(version: AppVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** Orders two versions: negative when `a` is older, zero when equal, positive when `a` is newer. */
export function compareVersions(a: AppVersion, b: AppVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** Whether `candidate` is strictly newer than `current`. */
export function isNewerVersion(
  candidate: AppVersion,
  current: AppVersion,
): boolean {
  return compareVersions(candidate, current) > 0;
}
