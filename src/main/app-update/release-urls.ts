const REPOSITORY = 'marcusrohden/mboard';
const RELEASES_PATH = `/${REPOSITORY}/releases/`;
const DOWNLOADS_PATH = `${RELEASES_PATH}download/`;

/** GitHub's API endpoint for the repository's latest published release. */
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

/** The page listing every release, for when no single release is known. */
export const RELEASES_PAGE_URL = `https://github.com${RELEASES_PATH}latest`;

function githubUrlUnder(text: string, pathPrefix: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const isGitHub =
    url.protocol === 'https:' &&
    url.host === 'github.com' &&
    url.username === '' &&
    url.password === '';
  return isGitHub && url.pathname.startsWith(pathPrefix) ? url.href : null;
}

/**
 * Returns the URL, normalised, when it is a page under mboard's GitHub releases, and `null` for anything
 * else. Only such pages are ever opened in the browser.
 */
export function trustedReleasePageUrl(text: string): string | null {
  return githubUrlUnder(text, RELEASES_PATH);
}

/** Returns the URL, normalised, when it downloads a file attached to one of mboard's GitHub releases. */
export function trustedReleaseDownloadUrl(text: string): string | null {
  return githubUrlUnder(text, DOWNLOADS_PATH);
}

/** The name of the zip a release carries for a Mac with this processor, as Electron Forge's zip maker names it. */
export function releaseZipName(arch: string, version: string): string {
  return `mboard-darwin-${arch}-${version}.zip`;
}
