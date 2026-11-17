import { isFileSystemError, type FileSystemError } from './fs/fs-errors';

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

function describeFileSystemError(error: FileSystemError): string {
  switch (error.code) {
    case 'EACCES':
    case 'EPERM':
      return "mboard doesn't have permission to change files in the board folder.";
    case 'ENOENT':
    case 'ENOTDIR':
      return "A file or folder mboard needed isn't there any more. It may have been moved or deleted outside mboard.";
    case 'ENOSPC':
      return "The disk is full, so mboard couldn't save the change.";
    case 'EROFS':
      return "The board folder is on a read-only disk, so mboard can't change it.";
    default:
      return `mboard couldn't read or write a file in the board folder (${error.code}).`;
  }
}

/**
 * The message to show the user for a failed command. Rule and validation errors already carry a
 * user-presentable message; file system errors are put into plain words, without paths.
 */
export function userFacingMessage(error: unknown): string {
  if (isFileSystemError(error)) return describeFileSystemError(error);
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return FALLBACK_MESSAGE;
}
