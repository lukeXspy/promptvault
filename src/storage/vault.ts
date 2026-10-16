import { lstat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { IoError, UsageError } from "../shared/errors.js";
import { escapeText } from "../shared/escape.js";

export interface ResolveVaultOptions {
  /** Value of the global `--vault` option, when provided. */
  cliPath?: string | undefined;
  /** Environment used for `PROMPTVAULT_HOME` (usually `process.env`). */
  env: Record<string, string | undefined>;
  /** Base directory for relative paths (usually `process.cwd()`). */
  cwd: string;
  /** Home directory for the last resort; injectable for tests. */
  homeDir?: string;
}

/**
 * Resolves the vault root to an absolute path (docs/CLI_SPEC.md § 2):
 * `--vault` → `PROMPTVAULT_HOME` → `<home>/.promptvault`. Relative paths
 * resolve from `cwd`; a blank env value counts as unset; `~` is never
 * expanded. A blank `--vault` value is invalid usage (exit 2).
 */
export function resolveVault(options: ResolveVaultOptions): string {
  if (options.cliPath !== undefined && options.cliPath.trim() === "") {
    throw new UsageError("invalid --vault value: empty path");
  }
  const base =
    nonBlank(options.cliPath) ??
    nonBlank(options.env["PROMPTVAULT_HOME"]) ??
    path.join(options.homeDir ?? homedir(), ".promptvault");
  return path.resolve(options.cwd, base);
}

function nonBlank(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/**
 * Creates `<vault>/prompts/` recursively; idempotent when the vault is
 * already initialized. Only `prompts/` is created (DECISIONS D1). The
 * `prompts/` path must be a real directory, never a symlink
 * (ARCHITECTURE § 6). Filesystem problems are I/O errors (exit 1,
 * docs/CLI_SPEC.md § 5.1).
 */
export async function initVault(vaultPath: string): Promise<void> {
  const promptsDir = path.join(vaultPath, "prompts");
  await asIoFailure(vaultPath, () => mkdir(promptsDir, { recursive: true }));
  const stats = await asIoFailure(vaultPath, () => lstat(promptsDir));
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
}

/** Runs a filesystem operation, mapping any failure to an echoed-safe IoError. */
async function asIoFailure<T>(
  vaultPath: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IoError(
      `cannot initialize vault at ${escapeText(vaultPath)}: ${escapeText(message)}`,
    );
  }
}
