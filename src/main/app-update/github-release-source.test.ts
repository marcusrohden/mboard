import { describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/github-latest-release.json';
import { createGitHubReleaseSource, parseLatestRelease, type Fetch } from './github-release-source';
import { LATEST_RELEASE_API_URL } from './release-urls';

const DIGEST = '5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef';

type ReleaseJson = typeof fixture;
type AssetJson = ReleaseJson['assets'][number];

function release(changes: Partial<ReleaseJson> = {}): ReleaseJson {
  return { ...structuredClone(fixture), ...changes };
}

function withAsset(changes: Partial<AssetJson>): ReleaseJson {
  const json = release();
  return { ...json, assets: [{ ...json.assets[0]!, ...changes }] };
}

describe('parseLatestRelease', () => {
  it('reads the version, the release page and the zip for this Mac', () => {
    expect(parseLatestRelease(release(), 'arm64')).toEqual({
      version: { major: 0, minor: 2, patch: 0 },
      releaseUrl: 'https://github.com/marcusrohden/mboard/releases/tag/v0.2.0',
      download: {
        fileName: 'mboard-darwin-arm64-0.2.0.zip',
        url: 'https://github.com/marcusrohden/mboard/releases/download/v0.2.0/mboard-darwin-arm64-0.2.0.zip',
        size: 104857600,
        sha256: DIGEST,
      },
    });
  });

  it('treats a release without a zip for this Mac as nothing new yet', () => {
    expect(parseLatestRelease(release(), 'x64')).toBeNull();
    expect(parseLatestRelease(release({ assets: [] }), 'arm64')).toBeNull();
  });

  it('treats a zip that is still uploading as nothing new yet', () => {
    expect(parseLatestRelease(withAsset({ state: 'starter' }), 'arm64')).toBeNull();
  });

  it('ignores a zip named for another version', () => {
    expect(parseLatestRelease(release({ tag_name: 'v0.3.0' }), 'arm64')).toBeNull();
  });

  it.each([
    ['without a digest', { digest: null as unknown as string }],
    ['with a digest of another kind', { digest: `sha512:${DIGEST}` }],
    ['with a malformed digest', { digest: 'sha256:abc' }],
    ['with a download outside the releases', { browser_download_url: 'https://example.com/mboard.zip' }],
    ['with no size', { size: 0 }],
  ])('offers the release page only for a zip %s', (_description, changes) => {
    const parsed = parseLatestRelease(withAsset(changes), 'arm64');
    expect(parsed?.download).toBeNull();
    expect(parsed?.releaseUrl).toBe('https://github.com/marcusrohden/mboard/releases/tag/v0.2.0');
  });

  it('accepts an upper-case digest, kept as lower case', () => {
    expect(parseLatestRelease(withAsset({ digest: `sha256:${DIGEST.toUpperCase()}` }), 'arm64')?.download?.sha256).toBe(
      DIGEST,
    );
  });

  it.each([
    ['not an object', 'v0.2.0'],
    ['a tag that is not a release version', release({ tag_name: 'nightly' })],
    ['a release page somewhere else', release({ html_url: 'https://example.com/releases/tag/v0.2.0' })],
    ['assets that are not a list', { ...release(), assets: {} }],
  ])('rejects an answer with %s', (_description, json) => {
    expect(() => parseLatestRelease(json, 'arm64')).toThrow(
      "GitHub's answer about the latest release wasn't understood.",
    );
  });
});

function respondWith(response: Response | Error): {
  fetch: Fetch;
  calls: Array<[string, RequestInit | undefined]>;
} {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetch: Fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    if (response instanceof Error) throw response;
    return response;
  });
  return { fetch, calls };
}

describe('createGitHubReleaseSource', () => {
  it('asks GitHub for the latest release with the API headers and parses it', async () => {
    const { fetch, calls } = respondWith(Response.json(release()));
    const latest = await createGitHubReleaseSource({
      fetch,
      arch: 'arm64',
    }).latest();

    expect(latest?.version).toEqual({ major: 0, minor: 2, patch: 0 });
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe(LATEST_RELEASE_API_URL);
    expect(init?.headers).toEqual({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mboard',
    });
  });

  it('explains a 404, which is what a private repository answers, rather than reading it as up to date', async () => {
    const { fetch } = respondWith(new Response('{"message":"Not Found"}', { status: 404 }));
    await expect(createGitHubReleaseSource({ fetch, arch: 'arm64' }).latest()).rejects.toThrow(
      "mboard couldn't find its releases on GitHub, so it can't check for a new version.",
    );
  });

  it.each([
    [403, 'GitHub is limiting update checks right now. Try again later.'],
    [429, 'GitHub is limiting update checks right now. Try again later.'],
    [500, "GitHub couldn't answer the update check (HTTP 500). Try again later."],
  ])('explains an HTTP %i answer', async (status, message) => {
    const { fetch } = respondWith(new Response('', { status }));
    await expect(createGitHubReleaseSource({ fetch, arch: 'arm64' }).latest()).rejects.toThrow(message);
  });

  it('explains a network failure', async () => {
    const { fetch } = respondWith(new TypeError('net::ERR_INTERNET_DISCONNECTED'));
    await expect(createGitHubReleaseSource({ fetch, arch: 'arm64' }).latest()).rejects.toThrow(
      "mboard couldn't reach GitHub to check for a new version. Check your internet connection.",
    );
  });

  it('explains an answer that is not JSON', async () => {
    const { fetch } = respondWith(new Response('<html>', { status: 200 }));
    await expect(createGitHubReleaseSource({ fetch, arch: 'arm64' }).latest()).rejects.toThrow(
      "GitHub's answer about the latest release wasn't understood.",
    );
  });
});
