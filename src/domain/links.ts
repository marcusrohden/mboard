/** The URL schemes a link in rendered markdown may open, outside the app: the browser, mail or Obsidian. */
export const OPENABLE_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:', 'obsidian:'] as const;

/**
 * Whether `url` is an absolute URL that mboard may hand to the system to open: http, https, mailto or obsidian.
 * Relative paths, `file:`, `javascript:` and anything else are not.
 */
export function isOpenableLink(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const { protocol } = new URL(url);
  return OPENABLE_LINK_PROTOCOLS.some((allowed) => allowed === protocol);
}
