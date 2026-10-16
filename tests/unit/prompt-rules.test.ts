import { describe, expect, it } from "vitest";
import {
  MAX_ID_LENGTH,
  MAX_TITLE_LENGTH,
  countCodePoints,
  isValidBody,
  isValidId,
  isValidSlug,
  isValidTag,
  isValidTitle,
  normalizeTitle,
  parseTagList,
  requireValidId,
} from "../../src/core/prompt-rules.js";
import { EXIT, UsageError } from "../../src/shared/errors.js";

function expectUsageError(run: () => unknown, pattern: RegExp): void {
  let caught: unknown = null;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UsageError);
  const error = caught as UsageError;
  expect(error.exitCode).toBe(EXIT.USAGE);
  expect(error.message).toMatch(pattern);
}

describe("slug rules", () => {
  it("accepts lowercase alphanumeric segments joined by single hyphens", () => {
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("review")).toBe(true);
    expect(isValidSlug("code-review")).toBe(true);
    expect(isValidSlug("a1-b2-c3")).toBe(true);
  });

  it("rejects malformed slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("Code")).toBe(false);
    expect(isValidSlug("code_review")).toBe(false);
    expect(isValidSlug("-code")).toBe(false);
    expect(isValidSlug("code-")).toBe(false);
    expect(isValidSlug("code--review")).toBe(false);
    expect(isValidSlug("code review")).toBe(false);
    expect(isValidSlug("código")).toBe(false);
    expect(isValidSlug("code.review")).toBe(false);
  });
});

describe("id rules", () => {
  it("is a slug limited to 80 characters", () => {
    expect(isValidId("code-review")).toBe(true);
    expect(isValidId("a".repeat(MAX_ID_LENGTH))).toBe(true);
    expect(isValidId("a".repeat(MAX_ID_LENGTH + 1))).toBe(false);
    expect(isValidId("Code-Review")).toBe(false);
  });
});

describe("title rules", () => {
  it("accepts non-blank single-line titles", () => {
    expect(isValidTitle("Review a code change")).toBe(true);
    expect(isValidTitle("ç")).toBe(true);
    expect(isValidTitle("t".repeat(MAX_TITLE_LENGTH))).toBe(true);
  });

  it("rejects blank, multi-line and overlong titles", () => {
    expect(isValidTitle("")).toBe(false);
    expect(isValidTitle("   ")).toBe(false);
    expect(isValidTitle("\t")).toBe(false);
    expect(isValidTitle("two\nlines")).toBe(false);
    expect(isValidTitle("two\rlines")).toBe(false);
    expect(isValidTitle("t".repeat(MAX_TITLE_LENGTH + 1))).toBe(false);
  });

  it("counts limits in Unicode code points", () => {
    expect(countCodePoints("😀")).toBe(1);
    expect(isValidTitle("😀".repeat(MAX_TITLE_LENGTH))).toBe(true);
    expect(isValidTitle("😀".repeat(MAX_TITLE_LENGTH + 1))).toBe(false);
  });
});

describe("tag rules", () => {
  it("accepts slugs and rejects anything else", () => {
    expect(isValidTag("development")).toBe(true);
    expect(isValidTag("code-review")).toBe(true);
    expect(isValidTag("")).toBe(false);
    expect(isValidTag("Code")).toBe(false);
    expect(isValidTag("two words")).toBe(false);
  });
});

describe("body rules", () => {
  it("accepts any content with a non-whitespace character", () => {
    expect(isValidBody("x")).toBe(true);
    expect(isValidBody("  \n\tx")).toBe(true);
    expect(isValidBody("😀")).toBe(true);
  });

  it("rejects empty and whitespace-only content", () => {
    expect(isValidBody("")).toBe(false);
    expect(isValidBody(" \n\t\n")).toBe(false);
  });
});

describe("requireValidId", () => {
  it("returns valid ids unchanged", () => {
    expect(requireValidId("code-review")).toBe("code-review");
  });

  it("rejects invalid ids with a usage error and a format message", () => {
    for (const bad of ["", "Code", "code--review", "a".repeat(81)]) {
      expectUsageError(() => requireValidId(bad), /invalid id/);
    }
    expectUsageError(() => requireValidId("Bad"), /must match/);
  });
});

describe("normalizeTitle", () => {
  it("trims surrounding whitespace (D38)", () => {
    expect(normalizeTitle("  Review a change  ")).toBe("Review a change");
  });

  it("accepts a full-length title", () => {
    const title = "t".repeat(MAX_TITLE_LENGTH);
    expect(normalizeTitle(title)).toBe(title);
  });

  it("rejects blank, multiline and overlong titles", () => {
    expectUsageError(() => normalizeTitle(""), /invalid title/);
    expectUsageError(() => normalizeTitle("   "), /invalid title/);
    expectUsageError(() => normalizeTitle("two\nlines"), /invalid title/);
    expectUsageError(
      () => normalizeTitle("t".repeat(MAX_TITLE_LENGTH + 1)),
      /invalid title/,
    );
  });
});

describe("parseTagList", () => {
  it("returns an empty list when --tags is absent", () => {
    expect(parseTagList(undefined)).toEqual([]);
  });

  it("trims, deduplicates and sorts ordinally", () => {
    expect(parseTagList(" review, development,review ")).toEqual([
      "development",
      "review",
    ]);
    expect(parseTagList("b,a-c,ab")).toEqual(["a-c", "ab", "b"]);
  });

  it("accepts exactly 20 tags", () => {
    const tags = Array.from({ length: 20 }, (_, index) => `t${index}`);
    expect(parseTagList(tags.join(","))).toHaveLength(20);
  });

  it("rejects empty items", () => {
    expectUsageError(() => parseTagList(""), /empty item/);
    expectUsageError(() => parseTagList("a,,b"), /empty item/);
    expectUsageError(() => parseTagList("a, ,b"), /empty item/);
  });

  it("rejects invalid tags", () => {
    expectUsageError(() => parseTagList("Review"), /invalid tag "Review"/);
    expectUsageError(() => parseTagList("two words"), /invalid tag/);
  });

  it("rejects more than 20 items before deduplication", () => {
    const tags = Array.from({ length: 21 }, (_, index) => `t${index}`);
    expectUsageError(() => parseTagList(tags.join(",")), /at most 20/);
  });
});
