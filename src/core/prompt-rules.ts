import { UsageError } from "../shared/errors.js";
import { escapeText } from "../shared/escape.js";

/** Domain rules for prompt ids, titles and tags (ARCHITECTURE § 3). */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ID_LENGTH = 80;
export const MAX_TITLE_LENGTH = 120;
export const MAX_TAGS = 20;
export const MAX_PROMPT_BYTES = 1024 * 1024; // 1 MiB of UTF-8 bytes

/** Counts Unicode code points, so limits count a 120-emoji title as 120. */
export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function isValidId(value: string): boolean {
  return isValidSlug(value) && countCodePoints(value) <= MAX_ID_LENGTH;
}

export function isValidTitle(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    countCodePoints(value) <= MAX_TITLE_LENGTH
  );
}

export function isValidTag(value: string): boolean {
  return isValidSlug(value);
}

/** True when a body has at least one non-whitespace character (D22). */
export function isValidBody(value: string): boolean {
  return /\S/u.test(value);
}

/** Validates an `add` id, returning it unchanged or throwing exit 2. */
export function requireValidId(raw: string): string {
  if (!isValidId(raw)) {
    throw new UsageError(
      `invalid id "${escapeText(raw)}": must match ${SLUG_PATTERN.source} and be at most ${MAX_ID_LENGTH} characters`,
    );
  }
  return raw;
}

/** Validates a single tag value (`add --tags` items, `list --tag`). */
export function requireValidTag(raw: string): string {
  if (!isValidTag(raw)) {
    throw new UsageError(
      `invalid tag "${escapeText(raw)}": must match ${SLUG_PATTERN.source}`,
    );
  }
  return raw;
}

/** Trims an `add` title and validates it (D38), returning the stored value. */
export function normalizeTitle(raw: string): string {
  const title = raw.trim();
  if (!isValidTitle(title)) {
    throw new UsageError(
      `invalid title: must be non-empty, single line, at most ${MAX_TITLE_LENGTH} characters`,
    );
  }
  return title;
}

/**
 * Parses the `add --tags` CSV (D10): trims items, rejects empty or invalid
 * items and more than 20, then deduplicates and sorts ordinally.
 */
export function parseTagList(csv: string | undefined): string[] {
  if (csv === undefined) {
    return [];
  }
  const tags: string[] = [];
  for (const raw of csv.split(",")) {
    const tag = raw.trim();
    if (tag === "") {
      throw new UsageError("invalid --tags value: empty item");
    }
    requireValidTag(tag);
    tags.push(tag);
  }
  if (tags.length > MAX_TAGS) {
    throw new UsageError(`invalid --tags value: at most ${MAX_TAGS} tags`);
  }
  return [...new Set(tags)].sort();
}
