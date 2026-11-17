import { parseDocument } from 'yaml';

/** The line that opens and closes a markdown file's YAML frontmatter. */
export const FRONTMATTER_FENCE = '---';

/** A markdown file split at its frontmatter. `frontmatter` is `null` when the file has none. */
export interface SplitContent {
  frontmatter: string | null;
  body: string;
}

function normaliseLineEndings(content: string): string {
  return content.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/**
 * Splits a markdown file into its frontmatter, without the fences, and the body after the closing fence.
 * A byte-order mark is dropped and line endings become `\n`. A file whose first line isn't a fence, or
 * whose frontmatter is never closed, has no frontmatter.
 */
export function splitFrontmatter(content: string): SplitContent {
  const lines = normaliseLineEndings(content).split('\n');
  if (lines[0]?.trimEnd() !== FRONTMATTER_FENCE) return { frontmatter: null, body: lines.join('\n') };
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trimEnd() === FRONTMATTER_FENCE);
  if (closingIndex === -1) return { frontmatter: null, body: lines.join('\n') };
  return {
    frontmatter: lines.slice(1, closingIndex).join('\n'),
    body: lines.slice(closingIndex + 1).join('\n'),
  };
}

function describeYamlFailure(error: { message: string }): string {
  const firstLine = error.message.split('\n')[0] ?? error.message;
  return firstLine.replace(/:$/, '');
}

/**
 * Reads frontmatter as a map of keys to values, or returns why it can't be read, in plain words. Empty
 * frontmatter is an empty map; YAML that is invalid, or isn't a mapping, can't be read.
 */
export function readFrontmatterMap(frontmatter: string): Map<unknown, unknown> | string {
  const yamlDocument = parseDocument(frontmatter, { schema: 'core', uniqueKeys: true });
  const [firstError] = yamlDocument.errors;
  if (firstError) return `The frontmatter isn't valid YAML: ${describeYamlFailure(firstError)}.`;
  if (yamlDocument.contents === null) return new Map();
  let parsed: unknown;
  try {
    parsed = yamlDocument.toJS({ mapAsMap: true });
  } catch (error) {
    return `The frontmatter isn't valid YAML: ${error instanceof Error ? error.message : 'it could not be read'}.`;
  }
  return parsed instanceof Map ? parsed : "The frontmatter isn't a mapping of keys to values.";
}
