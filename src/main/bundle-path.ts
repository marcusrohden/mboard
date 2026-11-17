import path from 'node:path';

const INDEX_FILE = 'index.html';

/**
 * Maps the path of an `app://bundle` request to a file inside the renderer
 * bundle directory. Returns `undefined` for malformed paths and for anything
 * that would resolve outside the bundle.
 */
export function resolveBundleFilePath(bundleDirectory: string, urlPathname: string): string | undefined {
  const decodedPathname = decodePathname(urlPathname);
  if (decodedPathname === undefined || decodedPathname.includes('\0')) {
    return undefined;
  }
  const requestedFile = decodedPathname.replace(/^\/+/, '') || INDEX_FILE;
  const filePath = path.resolve(bundleDirectory, requestedFile);
  return isInsideDirectory(bundleDirectory, filePath) ? filePath : undefined;
}

function decodePathname(urlPathname: string): string | undefined {
  try {
    return decodeURIComponent(urlPathname);
  } catch {
    return undefined;
  }
}

function isInsideDirectory(directory: string, filePath: string): boolean {
  const relativePath = path.relative(directory, filePath);
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
