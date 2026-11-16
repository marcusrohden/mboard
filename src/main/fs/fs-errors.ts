/** A Node file system error, which carries a `code` such as `ENOENT`. */
export interface FileSystemError extends Error {
  code: string;
}

/** Whether `error` is a Node file system error, optionally one of the given codes. */
export function isFileSystemError(error: unknown, ...codes: string[]): error is FileSystemError {
  if (!(error instanceof Error) || typeof (error as Partial<FileSystemError>).code !== 'string') return false;
  return codes.length === 0 || codes.includes((error as FileSystemError).code);
}

/** Whether `error` means the path doesn't exist. */
export function isNotFound(error: unknown): boolean {
  return isFileSystemError(error, 'ENOENT', 'ENOTDIR');
}

/** Whether `error` means the app isn't allowed to read or write the path. */
export function isPermissionDenied(error: unknown): boolean {
  return isFileSystemError(error, 'EACCES', 'EPERM');
}
