import { describe, expect, it } from "vitest";
import type { Prompt } from "../../src/core/prompt.js";
import { promptMatches, requireNonEmptyQuery } from "../../src/core/search.js";
import { UsageError } from "../../src/shared/errors.js";

function prompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    schemaVersion: 1,
    id: "code-review",
    title: "Review a code change",
    tags: ["development", "review"],
    body: "Check the diff carefully.\n",
    ...overrides,
  };
}

describe("promptMatches", () => {
  it("matches a hit in the id, title, a tag or the body", () => {
    expect(promptMatches(prompt(), "code-rev")).toBe(true); // id
    expect(promptMatches(prompt(), "a code change")).toBe(true); // title
    expect(promptMatches(prompt(), "development")).toBe(true); // tag
    expect(promptMatches(prompt(), "diff")).toBe(true); // body
    expect(promptMatches(prompt(), "nonexistent")).toBe(false);
  });

  it("is case-insensitive (Unicode toLowerCase)", () => {
    expect(promptMatches(prompt(), "CODE")).toBe(true);
    expect(promptMatches(prompt(), "Review A CODE Change")).toBe(true);
    expect(promptMatches(prompt({ title: "Été" }), "été")).toBe(true);
  });

  it("treats a multi-word query as one literal substring", () => {
    const multi = prompt({
      id: "code-quality",
      title: "Code quality",
      tags: [],
      body: "Review later.\n",
    });

    expect(promptMatches(multi, "code review")).toBe(false);
    expect(promptMatches(multi, "code quality")).toBe(true);
  });

  it("never treats the query as a pattern", () => {
    expect(promptMatches(prompt(), "re.*ew")).toBe(false);
    expect(promptMatches(prompt(), "^Review")).toBe(false);
  });
});

describe("requireNonEmptyQuery", () => {
  it("rejects the empty string (exit 2)", () => {
    expect(() => requireNonEmptyQuery("")).toThrow(UsageError);
    expect(() => requireNonEmptyQuery("")).toThrow("empty search query");
  });

  it("accepts whitespace as a literal substring", () => {
    expect(requireNonEmptyQuery(" ")).toBe(" ");
  });
});
