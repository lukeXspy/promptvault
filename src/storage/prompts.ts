import {
  lstat,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import { compareOrdinal } from "../core/order.js";
import { parsePrompt, type Prompt } from "../core/prompt.js";
import { isValidId } from "../core/prompt-rules.js";
import {
  CreationConflictError,
  InvalidPromptError,
  IoError,
  PromptNotFoundError,
  UsageError,
} from "../shared/errors.js";
import { escapeText } from "../shared/escape.js";

/**
 * Resolves `<vault>/prompts/` to a real path (ARCHITECTURE § 6): the
 * directory must exist, be a real directory and not be a symlink. A missing
 * directory means the vault is uninitialized (exit 2 with an init hint);
 * symlinks and non-directories are I/O failures (exit 1), matching `init`.
 */
export async function resolvePromptsDir(vaultPath: string): Promise<string> {
  const promptsDir = path.join(vaultPath, "prompts");
  let stats: Stats;
  try {
    stats = await lstat(promptsDir);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new UsageError(
        `vault not initialized at ${escapeText(vaultPath)}; run "promptvault init"`,
      );
    }
    throw new IoError(
      `cannot use vault at ${escapeText(vaultPath)}: ${escapeText(errorMessage(error))}`,
    );
  }
  if (stats.isSymbolicLink()) {
    throw new IoError(
      `vault path is a symbolic link, refusing to use it: ${escapeText(promptsDir)}`,
    );
  }
  if (!stats.isDirectory()) {
    throw new IoError(
      `vault path is not a directory: ${escapeText(promptsDir)}`,
    );
  }
  try {
    return await realpath(promptsDir);
  } catch (error) {
    throw new IoError(
      `cannot use vault at ${escapeText(vaultPath)}: ${escapeText(errorMessage(error))}`,
    );
  }
}

/** Reads a body file's raw bytes; unreadable files are I/O failures (exit 1). */
export async function readBodyFile(filePath: string): Promise<Uint8Array> {
  try {
    return await readFile(filePath);
  } catch (error) {
    throw new IoError(
      `cannot read body file ${escapeText(filePath)}: ${escapeText(errorMessage(error))}`,
    );
  }
}

/**
 * Writes `<id>.md` with exclusive creation (`wx`), so an existing prompt is
 * never overwritten (D20): `EEXIST` maps to `CreationConflictError` (exit 2).
 */
export async function writePromptExclusive(
  promptsDir: string,
  id: string,
  content: string,
): Promise<void> {
  const target = path.join(promptsDir, `${id}.md`);
  try {
    await writeFile(target, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new CreationConflictError(
        `prompt already exists: ${escapeText(id)}`,
      );
    }
    throw new IoError(
      `cannot write prompt file ${escapeText(target)}: ${escapeText(errorMessage(error))}`,
    );
  }
}

/**
 * One evaluated entry of `prompts/` (D50), in ordinal name order (D4).
 * `invalid` carries the reason without the `invalid prompt file` prefix.
 */
export type PromptsScanEntry =
  | { kind: "ok"; name: string; prompt: Prompt }
  | { kind: "invalid"; name: string; reason: string };

/**
 * Evaluates every entry in `prompts/` without stopping at findings (D50):
 * entries must be regular `.md` files named `<id>.md` with valid content
 * (ARCHITECTURE § 5/6, D7, D40). `list`/`search` aggregate the `invalid`
 * reasons into one error (D43); `doctor` renders them per file. Vault-level
 * and read failures stay hard I/O failures (exit 1, D43).
 */
export async function scanPromptsDir(
  vaultPath: string,
): Promise<PromptsScanEntry[]> {
  const promptsDir = await resolvePromptsDir(vaultPath);
  let names: string[];
  try {
    names = (await readdir(promptsDir)).sort(compareOrdinal);
  } catch (error) {
    throw new IoError(
      `cannot read vault directory ${escapeText(promptsDir)}: ${escapeText(errorMessage(error))}`,
    );
  }
  const entries: PromptsScanEntry[] = [];
  for (const name of names) {
    const target = path.join(promptsDir, name);
    const stats = await inspectEntry(target);
    if (stats.isSymbolicLink()) {
      entries.push({ kind: "invalid", name, reason: "symbolic link" });
      continue;
    }
    if (!stats.isFile()) {
      entries.push({ kind: "invalid", name, reason: "not a regular file" });
      continue;
    }
    if (!name.endsWith(".md")) {
      entries.push({ kind: "invalid", name, reason: "not a .md file" });
      continue;
    }
    let prompt: Prompt;
    try {
      prompt = parsePrompt(await readEntry(target));
    } catch (error) {
      if (!(error instanceof InvalidPromptError)) {
        throw error;
      }
      entries.push({ kind: "invalid", name, reason: error.message });
      continue;
    }
    if (`${prompt.id}.md` !== name) {
      entries.push({
        kind: "invalid",
        name,
        reason: `file name does not match id "${escapeText(prompt.id)}"`,
      });
      continue;
    }
    entries.push({ kind: "ok", name, prompt });
  }
  return entries;
}

/**
 * Loads and validates every entry in `prompts/` (ARCHITECTURE § 5/6, D7,
 * D40, D43): all findings are reported together as one `InvalidPromptError`
 * (exit 2, no partial results); unreadable vaults or entries are I/O
 * failures (exit 1). Returns prompts sorted by `id` (ordinal, D4).
 */
export async function loadAllPrompts(vaultPath: string): Promise<Prompt[]> {
  const entries = await scanPromptsDir(vaultPath);
  const findings: string[] = [];
  const prompts: Prompt[] = [];
  for (const entry of entries) {
    if (entry.kind === "invalid") {
      findings.push(finding(entry.name, entry.reason));
    } else {
      prompts.push(entry.prompt);
    }
  }
  if (findings.length > 0) {
    throw new InvalidPromptError(findings.join("; "));
  }
  return prompts.sort((a, b) => compareOrdinal(a.id, b.id));
}

/**
 * Loads the single prompt addressed by `id` for `show`/`render` (CLI_SPEC
 * § 5.4/5.5). A malformed id (rejected before any path is built) or a missing
 * file is "prompt not found" (exit 3); an existing but invalid entry is
 * invalid data (exit 2, D40/D46); vault-level and I/O failures match the
 * other commands.
 */
export async function loadPrompt(
  vaultPath: string,
  id: string,
): Promise<Prompt> {
  if (!isValidId(id)) {
    throw new PromptNotFoundError(`prompt not found: ${escapeText(id)}`);
  }
  const promptsDir = await resolvePromptsDir(vaultPath);
  const name = `${id}.md`;
  const target = path.join(promptsDir, name);
  let stats: Stats;
  try {
    stats = await lstat(target);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new PromptNotFoundError(`prompt not found: ${escapeText(id)}`);
    }
    throw new IoError(
      `cannot inspect entry ${escapeText(target)}: ${escapeText(errorMessage(error))}`,
    );
  }
  if (stats.isSymbolicLink()) {
    throw new InvalidPromptError(finding(name, "symbolic link"));
  }
  if (!stats.isFile()) {
    throw new InvalidPromptError(finding(name, "not a regular file"));
  }
  let prompt: Prompt;
  try {
    prompt = parsePrompt(await readEntry(target));
  } catch (error) {
    if (error instanceof InvalidPromptError) {
      throw new InvalidPromptError(finding(name, error.message));
    }
    throw error;
  }
  if (`${prompt.id}.md` !== name) {
    throw new InvalidPromptError(
      finding(name, `file name does not match id "${escapeText(prompt.id)}"`),
    );
  }
  return prompt;
}

async function inspectEntry(target: string): Promise<Stats> {
  try {
    return await lstat(target);
  } catch (error) {
    throw new IoError(
      `cannot inspect entry ${escapeText(target)}: ${escapeText(errorMessage(error))}`,
    );
  }
}

async function readEntry(target: string): Promise<Uint8Array> {
  try {
    return await readFile(target);
  } catch (error) {
    throw new IoError(
      `cannot read prompt file ${escapeText(target)}: ${escapeText(errorMessage(error))}`,
    );
  }
}

function finding(name: string, reason: string): string {
  return `invalid prompt file ${escapeText(name)}: ${reason}`;
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error) {
    const { code } = error as { code?: unknown };
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
