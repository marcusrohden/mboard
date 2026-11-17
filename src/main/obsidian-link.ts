/** The `obsidian://` link that opens a file in Obsidian (spec section 6). */
export function obsidianOpenUrl(absolutePath: string): string {
  return `obsidian://open?path=${encodeURIComponent(absolutePath)}`;
}
