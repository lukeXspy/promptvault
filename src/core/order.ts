/** Ordinal (UTF-16 code unit) string comparison, ascending (D4). */
export function compareOrdinal(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
