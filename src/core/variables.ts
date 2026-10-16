import { UsageError } from "../shared/errors.js";
import { escapeText } from "../shared/escape.js";

const NAME_START = /[A-Za-z_]/;
const NAME_PART = /[A-Za-z0-9_]/;

interface TokenSpan {
  name: string;
  end: number;
}

/**
 * Tries to read a well-formed token starting at `start`, where `body` begins
 * with `{{`. Grammar (D12): `{{` + spaces (U+0020) + name + spaces + `}}`,
 * name `[A-Za-z_][A-Za-z0-9_]*`. Returns `null` when the braces do not open
 * a well-formed token, leaving the text as literal body content.
 */
function readToken(body: string, start: number): TokenSpan | null {
  let i = start + 2;
  while (body[i] === " ") {
    i += 1;
  }
  const nameStart = i;
  if (i >= body.length || !NAME_START.test(body[i] ?? "")) {
    return null;
  }
  i += 1;
  while (i < body.length && NAME_PART.test(body[i] ?? "")) {
    i += 1;
  }
  const name = body.slice(nameStart, i);
  while (body[i] === " ") {
    i += 1;
  }
  if (body[i] !== "}" || body[i + 1] !== "}") {
    return null;
  }
  return { name, end: i + 2 };
}

/**
 * Collects variable names in order of first appearance (D12). Malformed
 * braces and nested structures stay literal; only well-formed tokens count.
 */
export function extractVariables(body: string): string[] {
  const names: string[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] === "{" && body[i + 1] === "{") {
      const token = readToken(body, i);
      if (token !== null) {
        if (!names.includes(token.name)) {
          names.push(token.name);
        }
        i = token.end;
        continue;
      }
    }
    i += 1;
  }
  return names;
}

/**
 * Replaces every well-formed token whose name is in `values` (D12). The walk
 * is literal and single-pass, so inserted values are never re-scanned and
 * malformed braces are copied through byte by byte.
 */
export function substituteVariables(
  body: string,
  values: ReadonlyMap<string, string>,
): string {
  let out = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "{" && body[i + 1] === "{") {
      const token = readToken(body, i);
      if (token !== null && values.has(token.name)) {
        out += values.get(token.name);
        i = token.end;
        continue;
      }
    }
    out += body[i];
    i += 1;
  }
  return out;
}

/**
 * Parses `--var` pairs (D13): split on the first `=`; the key must match
 * the variable grammar; duplicates are rejected. Values may contain `=` and
 * may be empty; keys are safe to echo, values never appear in messages.
 */
export function parseVariablePairs(
  pairs: readonly string[],
): Map<string, string> {
  const values = new Map<string, string>();
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      throw new UsageError("invalid --var: expected key=value");
    }
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new UsageError(`invalid --var key "${escapeText(key)}"`);
    }
    if (values.has(key)) {
      throw new UsageError(`duplicate --var key: ${key}`);
    }
    values.set(key, value);
  }
  return values;
}

/**
 * Full render pipeline in the D13 order: parse pairs → extract tokens →
 * missing values → unused values → single-pass substitution.
 */
export function renderBody(body: string, pairs: readonly string[]): string {
  const values = parseVariablePairs(pairs);
  const tokens = extractVariables(body);
  const missing = tokens.filter((name) => !values.has(name));
  if (missing.length > 0) {
    throw new UsageError(`missing variables: ${missing.join(", ")}`);
  }
  const unused = [...values.keys()].filter((name) => !tokens.includes(name));
  if (unused.length > 0) {
    throw new UsageError(`unused variables: ${unused.join(", ")}`);
  }
  return substituteVariables(body, values);
}
