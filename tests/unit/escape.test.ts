import { describe, expect, it } from "vitest";
import { escapeText } from "../../src/shared/escape.js";

describe("escapeText", () => {
  it("passes printable text through unchanged", () => {
    const text = "Review {{language}} — “ok” 日本語";
    expect(escapeText(text)).toBe(text);
  });

  it("passes tab and line feed through", () => {
    expect(escapeText("a\tb\nc")).toBe("a\tb\nc");
  });

  it("escapes C0 controls as lowercase \\uXXXX", () => {
    expect(escapeText("\u0000\u0007\u001b")).toBe("\\u0000\\u0007\\u001b");
  });

  it("escapes carriage return while keeping line feed", () => {
    expect(escapeText("a\r\nb")).toBe("a\\u000d\nb");
  });

  it("escapes DEL and the C1 range", () => {
    expect(escapeText("\u007f")).toBe("\\u007f");
    expect(escapeText("\u0080\u009b\u009f")).toBe("\\u0080\\u009b\\u009f");
  });
});
