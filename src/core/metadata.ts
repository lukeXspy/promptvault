import { z } from "zod";
import {
  MAX_ID_LENGTH,
  MAX_TAGS,
  MAX_TITLE_LENGTH,
  SLUG_PATTERN,
  isValidTitle,
} from "./prompt-rules.js";

const slug = z.string().regex(SLUG_PATTERN);

/** Strict metadata schema for the front matter (ARCHITECTURE § 3). */
export const promptMetadataSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: slug.max(MAX_ID_LENGTH),
  title: z
    .string()
    .refine(
      isValidTitle,
      `must be non-blank, single line, at most ${MAX_TITLE_LENGTH} characters`,
    ),
  tags: z.array(slug).max(MAX_TAGS).default([]),
});

export type PromptMetadata = z.infer<typeof promptMetadataSchema>;
