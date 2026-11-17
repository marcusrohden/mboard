import type { PublishedRelease, ReleaseDownload, ReleaseSource } from './adapters';
import {
  LATEST_RELEASE_API_URL,
  releaseZipName,
  trustedReleaseDownloadUrl,
  trustedReleasePageUrl,
} from './release-urls';
import { formatVersion, parseVersion } from './version';

/** The subset of `fetch` the release source and the installer use; Electron's `net.fetch` in the app. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface GitHubReleaseSourceOptions {
  fetch: Fetch;
  /** The processor architecture of this Mac, as `process.arch` names it. */
  arch: string;
}

type JsonObject = Record<string, unknown>;

const SHA256_DIGEST = /^sha256:([0-9a-f]{64})$/i;
const NOT_UNDERSTOOD = "GitHub's answer about the latest release wasn't understood.";
const UNREACHABLE = "mboard couldn't reach GitHub to check for a new version. Check your internet connection.";
const RATE_LIMITED = 'GitHub is limiting update checks right now. Try again later.';
const RELEASES_NOT_FOUND = "mboard couldn't find its releases on GitHub, so it can't check for a new version.";

const REQUEST_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'mboard',
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDownload(asset: JsonObject): ReleaseDownload | null {
  const { name, size, digest, browser_download_url: downloadUrl } = asset;
  const sha256 = typeof digest === 'string' ? SHA256_DIGEST.exec(digest)?.[1] : undefined;
  const url = typeof downloadUrl === 'string' ? trustedReleaseDownloadUrl(downloadUrl) : null;
  const hasSize = typeof size === 'number' && Number.isSafeInteger(size) && size > 0;
  if (typeof name !== 'string' || sha256 === undefined || url === null || !hasSize) return null;
  return { fileName: name, url, size, sha256: sha256.toLowerCase() };
}

/**
 * Reads GitHub's answer for the latest release. The release counts only once its zip for this Mac is
 * fully uploaded: until then it reads as `null`. A zip that can't be checked (no SHA-256 digest, or a
 * download outside mboard's releases) gives a release with no `download`.
 *
 * @throws Error when the answer doesn't have the shape of a GitHub release.
 */
export function parseLatestRelease(json: unknown, arch: string): PublishedRelease | null {
  if (!isJsonObject(json) || typeof json['tag_name'] !== 'string' || typeof json['html_url'] !== 'string') {
    throw new Error(NOT_UNDERSTOOD);
  }
  const version = parseVersion(json['tag_name']);
  const releaseUrl = trustedReleasePageUrl(json['html_url']);
  const assets = json['assets'];
  if (version === null || releaseUrl === null || !Array.isArray(assets)) throw new Error(NOT_UNDERSTOOD);

  const zipName = releaseZipName(arch, formatVersion(version));
  const zip = assets.filter(isJsonObject).find((asset) => asset['name'] === zipName);
  if (zip === undefined || zip['state'] !== 'uploaded') return null;
  return { version, releaseUrl, download: readDownload(zip) };
}

async function requestLatestRelease(fetch: Fetch): Promise<Response> {
  try {
    return await fetch(LATEST_RELEASE_API_URL, { headers: REQUEST_HEADERS });
  } catch {
    throw new Error(UNREACHABLE);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(NOT_UNDERSTOOD);
  }
}

/**
 * Looks up mboard's latest release through GitHub's public REST API, without a token. A 404 is a
 * failure, not "up to date": releases exist, so it means GitHub isn't showing them, as it does for a
 * private repository.
 */
export function createGitHubReleaseSource({ fetch, arch }: GitHubReleaseSourceOptions): ReleaseSource {
  return {
    async latest() {
      const response = await requestLatestRelease(fetch);
      if (response.status === 404) throw new Error(RELEASES_NOT_FOUND);
      if (response.status === 403 || response.status === 429) throw new Error(RATE_LIMITED);
      if (!response.ok)
        throw new Error(`GitHub couldn't answer the update check (HTTP ${response.status}). Try again later.`);
      return parseLatestRelease(await readJson(response), arch);
    },
  };
}
