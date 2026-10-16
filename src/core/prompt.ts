import {
  isAlias,
  isCollection,
  isNode,
  isPair,
  parseAllDocuments,
  stringify,
} from "yaml";
import { InvalidPromptError } from "../shared/errors.js";
import { promptMetadataSchema, type PromptMetadata } from "./metadata.js";
import { isValidBody } from "./prompt-rules.js";
import { decodeSource } from "./text.js";

/** A prompt: validated metadata plus the verbatim body. */
export interface Prompt extends PromptMetadata {
  body: string;
}

/**
 * Parses and validates a prompt file (ARCHITECTURE § 3): size, UTF-8, BOM
 * and line-ending canonicalization via `decodeSource`, then the
 * delimiter-line scan of the front matter, restricted YAML parsing, strict
 * metadata validation and a non-empty body check. Throws
 * `InvalidPromptError` on any violation.
 */
export function parsePrompt(source: Uint8Array): Prompt {
  const content = decodeSource(source, "prompt file");
  const lines = content.split("\n");
  if (lines[0] !== "---") {
    throw new InvalidPromptError(
      "missing front matter: the file must start with a '---' line",
    );
  }
  const closing = lines.indexOf("---", 1);
  if (closing === -1) {
    throw new InvalidPromptError(
      "unterminated front matter: missing closing '---' line",
    );
  }
  const metadata = parseMetadata(lines.slice(1, closing).join("\n"));
  const body = lines.slice(closing + 1).join("\n");
  if (!isValidBody(body)) {
    throw new InvalidPromptError(
      "empty prompt body: at least one non-whitespace character is required",
    );
  }
  return { ...metadata, body };
}

/** Serializes a prompt into the canonical file form (ARCHITECTURE § 3). */
export function serializePrompt(prompt: Prompt): string {
  const frontMatter = stringify(
    {
      schemaVersion: prompt.schemaVersion,
      id: prompt.id,
      title: prompt.title,
      tags: prompt.tags,
    },
    { lineWidth: 0 },
  );
  return `---\n${frontMatter}---\n${prompt.body}`;
}

function parseMetadata(yamlText: string): PromptMetadata {
  const documents = parseAllDocuments(yamlText, {
    schema: "core",
    uniqueKeys: true,
  });
  const document = documents[0];
  if (document === undefined) {
    throw new InvalidPromptError("invalid front matter: front matter is empty");
  }
  if (documents.length > 1) {
    throw new InvalidPromptError(
      "invalid front matter: multiple YAML documents are not allowed",
    );
  }
  const firstError = document.errors.at(0);
  if (firstError !== undefined) {
    throw new InvalidPromptError(
      `invalid front matter: ${firstLine(firstError.message)}`,
    );
  }
  assertInert(document.contents);
  const raw: unknown = document.toJS();
  if (raw === null || typeof raw !== "object") {
    throw new InvalidPromptError(
      "invalid front matter: expected a YAML mapping",
    );
  }
  const result = promptMetadataSchema.safeParse(raw);
  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => {
        const at =
          issue.path.length > 0 ? issue.path.join(".") : "front matter";
        return `${at}: ${issue.message}`;
      })
      .join("; ");
    throw new InvalidPromptError(`invalid front matter: ${summary}`);
  }
  return result.data;
}

/** Rejects YAML anchors, aliases and custom tags (ARCHITECTURE § 3). */
function assertInert(node: unknown): void {
  if (isPair(node)) {
    assertInert(node.key);
    assertInert(node.value);
    return;
  }
  if (isAlias(node)) {
    throw new InvalidPromptError(
      "invalid front matter: YAML aliases are not allowed",
    );
  }
  if (!isNode(node)) {
    return;
  }
  if (node.anchor !== undefined) {
    throw new InvalidPromptError(
      "invalid front matter: YAML anchors are not allowed",
    );
  }
  if (typeof node.tag === "string" && node.tag.startsWith("!")) {
    throw new InvalidPromptError(
      "invalid front matter: custom YAML tags are not allowed",
    );
  }
  if (isCollection(node)) {
    for (const item of node.items) {
      assertInert(item);
    }
  }
}

/** First line of a YAML error message, without the trailing colon. */
function firstLine(message: string): string {
  const [line = message] = message.split("\n");
  return line.replace(/:$/, "");
}
