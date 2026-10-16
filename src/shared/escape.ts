/**
 * Escapes control characters in text destined for CLI output
 * (ARCHITECTURE § 8, DECISIONS D15): tab and line feed pass through; every
 * other code point < U+0020, plus DEL and the C1 range, becomes `\uXXXX`.
 * Files are never modified by this.
 */
export function escapeText(value: string): string {
  let escaped = "";
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    const isControl =
      codePoint < 0x20 ||
      codePoint === 0x7f ||
      (codePoint >= 0x80 && codePoint <= 0x9f);
    if (!isControl || char === "\t" || char === "\n") {
      escaped += char;
    } else {
      escaped += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    }
  }
  return escaped;
}
