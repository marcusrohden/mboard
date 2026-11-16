/**
 * Raised when an IPC call arrives from a frame whose origin main does not trust.
 */
export class UntrustedSenderError extends Error {
  constructor(channel: string, senderOrigin: string | undefined) {
    super(
      `Refused IPC call on "${channel}" from untrusted origin "${senderOrigin ?? 'unknown'}".`,
    );
    this.name = 'UntrustedSenderError';
  }
}

/**
 * Rejects IPC calls unless they come from a live frame on the trusted renderer
 * origin. A missing frame (navigated away or destroyed) is never trusted.
 *
 * @throws {UntrustedSenderError} when the sender is not trusted.
 */
export function assertTrustedSender(
  channel: string,
  senderOrigin: string | undefined,
  trustedOrigin: string,
): void {
  if (senderOrigin !== trustedOrigin) {
    throw new UntrustedSenderError(channel, senderOrigin);
  }
}
