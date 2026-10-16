import { describe, expect, it } from "vitest";
import {
  extractVariables,
  parseVariablePairs,
  renderBody,
  substituteVariables,
} from "../../src/core/variables.js";
import { UsageError } from "../../src/shared/errors.js";

describe("extractVariables", () => {
  it("collects names in order of first appearance, deduplicated", () => {
    expect(extractVariables("a {{x}} b {{y}} c {{x}}")).toEqual(["x", "y"]);
    expect(extractVariables("no tokens here")).toEqual([]);
    expect(extractVariables("")).toEqual([]);
  });

  it("accepts optional spaces around the name", () => {
    expect(extractVariables("{{ x }}")).toEqual(["x"]);
    expect(extractVariables("{{  x}}")).toEqual(["x"]);
    expect(extractVariables("{{x  }}")).toEqual(["x"]);
  });

  it("treats malformed tokens as literal text", () => {
    expect(extractVariables("{{}}")).toEqual([]);
    expect(extractVariables("{{ }}")).toEqual([]);
    expect(extractVariables("{{a-b}}")).toEqual([]);
    expect(extractVariables("{{1a}}")).toEqual([]);
    expect(extractVariables("{{a b}}")).toEqual([]);
    expect(extractVariables("{{\tx}}")).toEqual([]);
    expect(extractVariables("{{a")).toEqual([]);
    expect(extractVariables("{{a}")).toEqual([]);
    expect(extractVariables("a}}")).toEqual([]);
  });

  it("does not recurse into nested braces but finds inner tokens", () => {
    expect(extractVariables("{{a{{b}}}}")).toEqual(["b"]);
    expect(extractVariables("{{{b}}")).toEqual(["b"]);
    expect(extractVariables("{{{{a}}")).toEqual(["a"]);
  });
});

describe("substituteVariables", () => {
  it("replaces every occurrence literally, including spaced tokens", () => {
    const values = new Map([["x", "1"]]);
    expect(substituteVariables("{{x}} and {{ x }}", values)).toBe("1 and 1");
  });

  it("never re-scans inserted values (single pass)", () => {
    const values = new Map([
      ["a", "{{b}}"],
      ["b", "Z"],
    ]);
    expect(substituteVariables("{{a}}", values)).toBe("{{b}}");
  });

  it("preserves malformed braces and tokens without a value", () => {
    const values = new Map([["x", "1"]]);
    expect(substituteVariables("{{a-b}} {{1x}} {{}}", values)).toBe(
      "{{a-b}} {{1x}} {{}}",
    );
    expect(substituteVariables("{{y}}", values)).toBe("{{y}}");
  });

  it("supports empty values (token removed) and brace soup values", () => {
    expect(substituteVariables("[{{x}}]", new Map([["x", ""]]))).toBe("[]");
    const braceValue = "}}}";
    expect(substituteVariables("{{x}}", new Map([["x", braceValue]]))).toBe(
      "}}}",
    );
  });

  it("substitutes inner tokens of nested structures only", () => {
    expect(substituteVariables("{{a{{b}}}}", new Map([["b", "X"]]))).toBe(
      "{{aX}}",
    );
  });
});

describe("parseVariablePairs", () => {
  it("splits on the first `=` and keeps values intact", () => {
    const values = parseVariablePairs(["k=a=b", "empty=", "n=1"]);
    expect([...values]).toEqual([
      ["k", "a=b"],
      ["empty", ""],
      ["n", "1"],
    ]);
  });

  it("rejects a pair without `=` without echoing it", () => {
    expect(() => parseVariablePairs(["foo"])).toThrow(UsageError);
    expect(() => parseVariablePairs(["foo"])).toThrow(
      "invalid --var: expected key=value",
    );
    expect(() => parseVariablePairs(["foo"])).not.toThrow("foo");
  });

  it("rejects invalid keys, escaping them in the message", () => {
    expect(() => parseVariablePairs(["1a=1"])).toThrow(
      'invalid --var key "1a"',
    );
    expect(() => parseVariablePairs(["a-b=1"])).toThrow(
      'invalid --var key "a-b"',
    );
    expect(() => parseVariablePairs(["=1"])).toThrow('invalid --var key ""');
    expect(() => parseVariablePairs(["\u0007x=1"])).toThrow(
      'invalid --var key "\\u0007x"',
    );
  });

  it("rejects duplicate keys (first wins position, value not echoed)", () => {
    expect(() => parseVariablePairs(["a=1", "a=SECRET"])).toThrow(
      "duplicate --var key: a",
    );
    expect(() => parseVariablePairs(["a=1", "a=SECRET"])).not.toThrow("SECRET");
  });
});

describe("renderBody", () => {
  it("renders a valid body in one pass", () => {
    expect(renderBody("Hi {{name}}!", ["name=Ana"])).toBe("Hi Ana!");
  });

  it("reports missing names in appearance order, values never echoed", () => {
    expect(() => renderBody("{{x}} {{y}} {{x}}", ["y=SECRET"])).toThrow(
      "missing variables: x",
    );
    expect(() => renderBody("{{x}} {{y}}", [])).toThrow(
      "missing variables: x, y",
    );
  });

  it("reports unused names in provision order, values never echoed", () => {
    expect(() => renderBody("{{x}}", ["x=1", "y=SECRET", "z=2"])).toThrow(
      "unused variables: y, z",
    );
  });

  it("reports a malformed pair before any token analysis", () => {
    expect(() => renderBody("{{x}}", ["bad"])).toThrow(
      "invalid --var: expected key=value",
    );
  });

  it("reports duplicates before missing/unused checks", () => {
    expect(() => renderBody("{{x}}", ["x=1", "x=2", "y=3"])).toThrow(
      "duplicate --var key: x",
    );
  });

  it("reports missing before unused", () => {
    expect(() => renderBody("{{x}}", ["y=1"])).toThrow("missing variables: x");
  });
});
