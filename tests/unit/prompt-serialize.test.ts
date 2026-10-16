import { describe, expect, it } from "vitest";
import {
  parsePrompt,
  serializePrompt,
  type Prompt,
} from "../../src/core/prompt.js";

function roundTrip(prompt: Prompt): Prompt {
  return parsePrompt(Buffer.from(serializePrompt(prompt), "utf8"));
}

describe("serializePrompt", () => {
  it("writes the canonical file form", () => {
    const serialized = serializePrompt({
      schemaVersion: 1,
      id: "code-review",
      title: "Review a code change",
      tags: ["development", "review"],
      body: "Review the following {{language}} code.\n",
    });
    const expected = [
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
    ].join("\n");
    expect(serialized).toBe(expected);
  });

  it("writes empty tags in flow style", () => {
    const serialized = serializePrompt({
      schemaVersion: 1,
      id: "a",
      title: "T",
      tags: [],
      body: "Body.\n",
    });
    const expected = [
      "---",
      "schemaVersion: 1",
      "id: a",
      "title: T",
      "tags: []",
      "---",
      "Body.",
      "",
    ].join("\n");
    expect(serialized).toBe(expected);
  });

  it("keeps long titles on a single line", () => {
    const title = `${"W".repeat(110)} ${"E".repeat(9)}`;
    const serialized = serializePrompt({
      schemaVersion: 1,
      id: "long-title",
      title,
      tags: [],
      body: "Body.\n",
    });
    expect(serialized.split("\n")[3]).toBe(`title: ${title}`);
  });

  it("round-trips every valid prompt", () => {
    const cases: Prompt[] = [
      {
        schemaVersion: 1,
        id: "plain",
        title: "Plain title",
        tags: [],
        body: "Body without final newline",
      },
      {
        schemaVersion: 1,
        id: "unicode",
        title: "Acentuação, 日本語 e emoji 😀",
        tags: ["development", "code-review"],
        body: "Line\n---\nwith delimiter\n\n  padded  \n",
      },
      {
        schemaVersion: 1,
        id: "special-title",
        title: "null: #hashtag 'quoted' 0123",
        tags: [],
        body: "x\n",
      },
      {
        schemaVersion: 1,
        id: "long-title",
        title: `${"W".repeat(110)} ${"E".repeat(9)}`,
        tags: ["a"],
        body: "Body.\n",
      },
    ];
    for (const prompt of cases) {
      expect(roundTrip(prompt)).toEqual(prompt);
    }
  });

  it("re-serializes identically after a round-trip", () => {
    const prompts: Prompt[] = [
      {
        schemaVersion: 1,
        id: "code-review",
        title: "Review a code change",
        tags: ["development", "review"],
        body: "Review the following {{language}} code.\n",
      },
      {
        schemaVersion: 1,
        id: "special-title",
        title: "null: #hashtag 'quoted' 0123",
        tags: [],
        body: "x\n",
      },
    ];
    for (const prompt of prompts) {
      const once = serializePrompt(prompt);
      expect(serializePrompt(roundTrip(prompt))).toBe(once);
    }
  });
});
