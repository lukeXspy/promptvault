import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const cliPath = fileURLToPath(
  new URL("../../src/cli/main.ts", import.meta.url),
);

// tsx's Node loader as an absolute URL: `--import tsx` would fail whenever a
// spawn uses a working directory outside the repository (dependencies of the
// loader resolve from cwd), so resolve it from this helper's location.
const tsxLoaderUrl = pathToFileURL(
  createRequire(import.meta.url).resolve("tsx"),
).href;

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  /** Environment overrides for the child process. */
  env?: Record<string, string>;
  /** Working directory for the child (defaults to the repository root). */
  cwd?: string;
}

let fallbackEnvHome: string | undefined;

/**
 * A throwaway `PROMPTVAULT_HOME` so spawned processes can never reach a real
 * vault (DECISIONS D25/D56). The path is unique but deliberately never
 * created: vitest force-terminates its forked workers on Windows, so
 * in-process cleanup hooks do not run and a materialized directory would leak
 * one entry per worker and run. A correctly behaving CLI only needs the path
 * string; a CLI that wrongly fell back to the default home would create
 * files there instead of reading a real vault.
 */
function defaultEnvHome(): string {
  if (fallbackEnvHome === undefined) {
    fallbackEnvHome = path.join(
      tmpdir(),
      `promptvault-test-env-home-${randomUUID()}`,
    );
  }
  return fallbackEnvHome;
}

/** Spawns the CLI (through tsx) with a controlled environment. */
export function runCli(args: string[], options: RunCliOptions = {}): CliResult {
  const overrideHome = options.env?.["PROMPTVAULT_HOME"];
  if (overrideHome !== undefined && overrideHome.trim() === "") {
    throw new Error(
      "runCli: a PROMPTVAULT_HOME override must be a non-blank temp path",
    );
  }
  const result = spawnSync(
    process.execPath,
    ["--import", tsxLoaderUrl, cliPath, ...args],
    {
      cwd: options.cwd ?? repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PROMPTVAULT_HOME: defaultEnvHome(),
        ...options.env,
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Creates a throwaway directory inside the OS temp directory. */
export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

/** Removes a throwaway directory; never point it at real data. */
export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
