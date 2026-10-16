import {
  existsSync,
  lstatSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDir, runCli } from "../helpers/run-cli.js";

const temps: string[] = [];

function temp(prefix: string): string {
  const dir = makeTempDir(prefix);
  temps.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of temps) {
    removeTempDir(dir);
  }
});

describe("promptvault init", () => {
  it("creates <vault>/prompts recursively and reports on stderr only", () => {
    const vault = path.join(temp("pv-init-"), "nested", "vault");
    const { status, stdout, stderr } = runCli(["--vault", vault, "init"]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("vault initialized at");
    expect(stderr).toContain(vault);
    expect(existsSync(path.join(vault, "prompts"))).toBe(true);
    expect(readdirSync(vault)).toEqual(["prompts"]);
    expect(readdirSync(path.join(vault, "prompts"))).toEqual([]);
  });

  it("is idempotent", () => {
    const vault = temp("pv-init-");
    const first = runCli(["--vault", vault, "init"]);
    const second = runCli(["--vault", vault, "init"]);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(readdirSync(vault)).toEqual(["prompts"]);
    expect(readdirSync(path.join(vault, "prompts"))).toEqual([]);
  });

  it("accepts --vault after the subcommand (DECISIONS D18)", () => {
    const vault = temp("pv-init-");
    const { status } = runCli(["init", "--vault", vault]);
    expect(status).toBe(0);
    expect(existsSync(path.join(vault, "prompts"))).toBe(true);
  });

  it("prefers --vault over PROMPTVAULT_HOME", () => {
    const vault = temp("pv-init-cli-");
    const envHome = temp("pv-init-env-");
    const { status } = runCli(["--vault", vault, "init"], {
      env: { PROMPTVAULT_HOME: envHome },
    });
    expect(status).toBe(0);
    expect(existsSync(path.join(vault, "prompts"))).toBe(true);
    expect(readdirSync(envHome)).toEqual([]);
  });

  it("uses PROMPTVAULT_HOME when --vault is absent", () => {
    const envHome = temp("pv-init-env-");
    const { status } = runCli(["init"], { env: { PROMPTVAULT_HOME: envHome } });
    expect(status).toBe(0);
    expect(existsSync(path.join(envHome, "prompts"))).toBe(true);
  });

  it("resolves a relative --vault from the working directory", () => {
    const cwd = temp("pv-init-cwd-");
    const { status, stderr } = runCli(["--vault", "rel-vault", "init"], {
      cwd,
    });
    expect(status).toBe(0);
    expect(existsSync(path.join(cwd, "rel-vault", "prompts"))).toBe(true);
    expect(stderr).toContain(path.join(cwd, "rel-vault"));
  });

  it("fails with exit 1 when prompts/ is blocked by a file", () => {
    const vault = temp("pv-init-blocked-");
    writeFileSync(path.join(vault, "prompts"), "not a directory");
    const { status, stdout, stderr } = runCli(["--vault", vault, "init"]);
    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("promptvault: error:");
  });

  it("fails with exit 1 when the vault path itself is a file", () => {
    const blocker = path.join(temp("pv-init-file-"), "blocker");
    writeFileSync(blocker, "x");
    const { status, stdout, stderr } = runCli(["--vault", blocker, "init"]);
    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("promptvault: error:");
  });

  it("rejects a symlinked prompts/ directory with exit 1", () => {
    const vault = temp("pv-init-link-");
    const target = temp("pv-init-target-");
    const promptsPath = path.join(vault, "prompts");
    const type = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(target, promptsPath, type);
    expect(lstatSync(promptsPath).isSymbolicLink()).toBe(true);

    const { status, stdout, stderr } = runCli(["--vault", vault, "init"]);
    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("symbolic link");
    expect(readdirSync(target)).toEqual([]);
  });
});
