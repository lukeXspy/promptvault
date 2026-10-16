import { describe, expect, it } from "vitest";
import { parsePrompt } from "../../src/core/prompt.js";
import { MAX_PROMPT_BYTES } from "../../src/core/prompt-rules.js";
import { EXIT, InvalidPromptError } from "../../src/shared/errors.js";

function promptFile(frontMatter: string, body = "Body text.\n"): Buffer {
  return Buffer.from(`---\n${frontMatter}\n---\n${body}`, "utf8");
}

function expectInvalid(source: Uint8Array, pattern: RegExp): void {
  let caught: unknown = null;
  try {
    parsePrompt(source);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(InvalidPromptError);
  const error = caught as InvalidPromptError;
  expect(error.exitCode).toBe(EXIT.USAGE);
  expect(error.message).toMatch(pattern);
}

describe("parsePrompt", () => {
  it("parses the reference example from the architecture", () => {
    const source = [
      "---",
      "schemaVersion: 1",
      "id: code-review",
      "title: Review a code change",
      "tags:",
      "  - development",
      "  - review",
      "---",
      "Review the following {{language}} code.",
      "",
      "Focus on:",
      "- Correctness",
      "- Security",
      "- Maintainability",
      "",
    ].join("\n");
    expect(parsePrompt(Buffer.from(source, "utf8"))).toEqual({
      schemaVersion: 1,
      id: "code-review",
      title: "Review a code change",
      tags: ["development", "review"],
      body: "Review the following {{language}} code.\n\nFocus on:\n- Correctness\n- Security\n- Maintainability\n",
    });
  });

  it("defaults tags to an empty array", () => {
    const prompt = parsePrompt(promptFile("schemaVersion: 1\nid: a\ntitle: T"));
    expect(prompt.tags).toEqual([]);
  });

  it("preserves the body byte for byte", () => {
    const body = "  leading spaces\n\n---\ntrailing spaces  \nno final newline";
    const prompt = parsePrompt(
      promptFile("schemaVersion: 1\nid: a\ntitle: T", body),
    );
    expect(prompt.body).toBe(body);
  });

  it("keeps --- lines inside the body", () => {
    const body = "Body\n---\nmore\n";
    const prompt = parsePrompt(
      promptFile("schemaVersion: 1\nid: a\ntitle: T", body),
    );
    expect(prompt.body).toBe(body);
  });

  it("keeps a body that starts with a --- line", () => {
    const body = "---\nAfter the delimiter\n";
    const prompt = parsePrompt(
      promptFile("schemaVersion: 1\nid: a\ntitle: T", body),
    );
    expect(prompt.body).toBe(body);
  });

  it("strips a UTF-8 BOM", () => {
    const file = promptFile("schemaVersion: 1\nid: a\ntitle: T");
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), file]);
    expect(parsePrompt(withBom).id).toBe("a");
  });

  it("canonicalizes CRLF to LF", () => {
    const source =
      "---\r\nschemaVersion: 1\r\nid: a\r\ntitle: T\r\n---\r\nBody line\r\nsecond\r\n";
    const prompt = parsePrompt(Buffer.from(source, "utf8"));
    expect(prompt.title).toBe("T");
    expect(prompt.body).toBe("Body line\nsecond\n");
  });

  it("rejects a file without front matter", () => {
    expectInvalid(
      Buffer.from("id: a\ntitle: T\n---\nBody.\n", "utf8"),
      /missing front matter/,
    );
    expectInvalid(
      Buffer.from("\n---\nid: a\n---\nBody.\n", "utf8"),
      /missing front matter/,
    );
  });

  it("rejects an unterminated front matter", () => {
    expectInvalid(
      Buffer.from("---\nid: a\ntitle: T\n", "utf8"),
      /unterminated front matter/,
    );
  });

  it("rejects empty front matter", () => {
    expectInvalid(
      Buffer.from("---\n---\nBody.\n", "utf8"),
      /front matter is empty/,
    );
  });

  it("rejects unknown properties", () => {
    expectInvalid(
      promptFile("schemaVersion: 1\nid: a\ntitle: T\nextra: true"),
      /extra/,
    );
  });

  it("rejects missing properties", () => {
    expectInvalid(promptFile("id: a\ntitle: T"), /schemaVersion/);
    expectInvalid(promptFile("schemaVersion: 1\nid: a"), /title/);
    expectInvalid(promptFile("schemaVersion: 1\ntitle: T"), /id/);
  });

  it("rejects wrong types", () => {
    expectInvalid(
      promptFile('schemaVersion: "1"\nid: a\ntitle: T'),
      /schemaVersion/,
    );
    expectInvalid(
      promptFile("schemaVersion: 1\nid: a\ntitle: T\ntags: development"),
      /tags/,
    );
    expectInvalid(promptFile("schemaVersion: 1\nid: [a]\ntitle: T"), /id/);
  });

  it("rejects unsupported schema versions", () => {
    expectInvalid(
      promptFile("schemaVersion: 2\nid: a\ntitle: T"),
      /schemaVersion/,
    );
  });

  it("rejects invalid ids", () => {
    expectInvalid(promptFile("schemaVersion: 1\nid: Code\ntitle: T"), /id/);
    expectInvalid(
      promptFile(`schemaVersion: 1\nid: ${"a".repeat(81)}\ntitle: T`),
      /id/,
    );
  });

  it("rejects invalid tags", () => {
    expectInvalid(
      promptFile("schemaVersion: 1\nid: a\ntitle: T\ntags: [Development]"),
      /tags/,
    );
    const manyTags = Array.from({ length: 21 }, (_, i) => `t${i + 1}`);
    expectInvalid(
      promptFile(
        `schemaVersion: 1\nid: a\ntitle: T\ntags: [${manyTags.join(", ")}]`,
      ),
      /tags/,
    );
  });

  it("rejects duplicate keys", () => {
    expectInvalid(
      promptFile("schemaVersion: 1\nid: a\nid: b\ntitle: T"),
      /unique/,
    );
  });

  it("rejects anchors and aliases", () => {
    expectInvalid(
      promptFile("schemaVersion: 1\nid: &a code\ntitle: *a"),
      /anchors|aliases/,
    );
  });

  it("rejects multiple YAML documents", () => {
    expectInvalid(
      Buffer.from("---\nid: a\n--- extra\n---\nBody.\n", "utf8"),
      /multiple YAML documents/,
    );
  });

  it("rejects custom YAML tags", () => {
    expectInvalid(
      promptFile("schemaVersion: 1\nid: !foo a\ntitle: T"),
      /custom YAML tags/,
    );
  });

  it("rejects an empty or whitespace-only body", () => {
    expectInvalid(
      promptFile("schemaVersion: 1\nid: a\ntitle: T", ""),
      /empty prompt body/,
    );
    expectInvalid(
      promptFile("schemaVersion: 1\nid: a\ntitle: T", "   \n\t\n"),
      /empty prompt body/,
    );
  });

  it("accepts a file exactly at the 1 MiB limit", () => {
    const prefix =
      "---\nschemaVersion: 1\nid: big\ntitle: Big\ntags: []\n---\n";
    const fillerSize = MAX_PROMPT_BYTES - Buffer.byteLength(prefix);
    const source = Buffer.concat([
      Buffer.from(prefix, "utf8"),
      Buffer.alloc(fillerSize, 0x78),
    ]);
    expect(source.byteLength).toBe(MAX_PROMPT_BYTES);
    const prompt = parsePrompt(source);
    expect(prompt.id).toBe("big");
    expect(prompt.body.length).toBe(fillerSize);
  });

  it("rejects a file one byte above the 1 MiB limit", () => {
    const source = Buffer.concat([
      Buffer.alloc(MAX_PROMPT_BYTES, 0x78),
      Buffer.from("x", "utf8"),
    ]);
    expectInvalid(source, /too large/);
  });

  it("rejects invalid UTF-8", () => {
    const source = Buffer.concat([
      Buffer.from("---\nid: a\n", "utf8"),
      Buffer.from([0xc3, 0x28]),
    ]);
    expectInvalid(source, /not valid UTF-8/);
  });
});
