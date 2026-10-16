import { describe, expect, it } from "vitest";
import { compareOrdinal } from "../../src/core/order.js";

describe("compareOrdinal", () => {
  it("sorts ascending by UTF-16 code unit", () => {
    expect(compareOrdinal("a", "b")).toBe(-1);
    expect(compareOrdinal("b", "a")).toBe(1);
    expect(compareOrdinal("abc", "abc")).toBe(0);
    expect(["b", "a", "c"].sort(compareOrdinal)).toEqual(["a", "b", "c"]);
  });

  it("is ordinal, not locale-aware", () => {
    // "Z" (U+005A) < "a" (U+0061) ordinally; locale collation would differ.
    expect(compareOrdinal("Z", "a")).toBe(-1);
    // Digits compare by prefix, not numerically: "a10" < "a2".
    expect(["a2", "a10"].sort(compareOrdinal)).toEqual(["a10", "a2"]);
  });
});
