import { describe, expect, it } from 'vitest';
import { obsidianOpenUrl } from './obsidian-link';
import { userFacingMessage } from './user-facing-error';

describe('userFacingMessage', () => {
  it('keeps the message of a rule or validation error', () => {
    expect(userFacingMessage(new Error('Only tasks in Done can be archived.'))).toBe(
      'Only tasks in Done can be archived.',
    );
  });

  it('puts file system errors into plain words without the path', () => {
    const error = Object.assign(new Error("ENOSPC: no space left on device, write '/Vault/Board/tasks/A.md'"), {
      code: 'ENOSPC',
    });
    expect(userFacingMessage(error)).toBe("The disk is full, so mboard couldn't save the change.");
  });

  it('falls back to a generic message for anything else', () => {
    expect(userFacingMessage('boom')).toBe('Something went wrong. Please try again.');
  });
});

describe('obsidianOpenUrl', () => {
  it('encodes the whole absolute path into an obsidian:// link', () => {
    expect(obsidianOpenUrl('/Users/me/Vault/Board/tasks/Fix #1 & more.md')).toBe(
      'obsidian://open?path=%2FUsers%2Fme%2FVault%2FBoard%2Ftasks%2FFix%20%231%20%26%20more.md',
    );
  });
});
