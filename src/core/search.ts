import { UsageError } from "../shared/errors.js";
import type { Prompt } from "./prompt.js";

/**
 * Matches `query` against one prompt (D5, CLI_SPEC § 5.5): the lowercased
 * query must be a literal substring of the lowercased id, title, any single
 * tag, or the body. No wildcards, no tokenization; a multi-word query is one
 * substring.
 */
export function promptMatches(prompt: Prompt, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    prompt.id.toLowerCase().includes(needle) ||
    prompt.title.toLowerCase().includes(needle) ||
    prompt.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
    prompt.body.toLowerCase().includes(needle)
  );
}

/**
 * Validates the `search` query: only the empty string is rejected (exit 2);
 * whitespace is a legitimate literal substring.
 */
export function requireNonEmptyQuery(raw: string): string {
  if (raw === "") {
    throw new UsageError("empty search query");
  }
  return raw;
}
