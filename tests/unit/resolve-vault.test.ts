import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EXIT, UsageError } from "../../src/shared/errors.js";
import { resolveVault } from "../../src/storage/vault.js";
import { makeTempDir, removeTempDir } from "../helpers/run-cli.js";

const cwd = makeTempDir("promptvault-resolve-cwd-");
const home = makeTempDir("promptvault-resolve-home-");
const elsewhere = makeTempDir("promptvault-resolve-elsewhere-");

afterAll(() => {
  removeTempDir(cwd);
  removeTempDir(home);
  removeTempDir(elsewhere);
});

describe("resolveVault", () => {
  it("prefers --vault over PROMPTVAULT_HOME and the home fallback", () => {
    const cliPath = path.join(elsewhere, "cli-vault");
    const result = resolveVault({
      cliPath,
      env: { PROMPTVAULT_HOME: path.join(elsewhere, "env-vault") },
      cwd,
      homeDir: home,
    });
    expect(result).toBe(cliPath);
  });

  it("uses PROMPTVAULT_HOME when --vault is absent", () => {
    const envPath = path.join(elsewhere, "env-vault");
    const result = resolveVault({
      env: { PROMPTVAULT_HOME: envPath },
      cwd,
      homeDir: home,
    });
    expect(result).toBe(envPath);
  });

  it("falls back to <home>/.promptvault with no sources", () => {
    const result = resolveVault({ env: {}, cwd, homeDir: home });
    expect(result).toBe(path.join(home, ".promptvault"));
  });

  it("treats a blank PROMPTVAULT_HOME as unset", () => {
    const result = resolveVault({
      env: { PROMPTVAULT_HOME: "   " },
      cwd,
      homeDir: home,
    });
    expect(result).toBe(path.join(home, ".promptvault"));
  });

  it("resolves a relative --vault from the working directory", () => {
    const result = resolveVault({
      cliPath: path.join("vaults", "rel"),
      env: {},
      cwd,
      homeDir: home,
    });
    expect(result).toBe(path.resolve(cwd, "vaults", "rel"));
  });

  it("resolves a relative PROMPTVAULT_HOME from the working directory", () => {
    const result = resolveVault({
      env: { PROMPTVAULT_HOME: "env-rel" },
      cwd,
      homeDir: home,
    });
    expect(result).toBe(path.resolve(cwd, "env-rel"));
  });

  it("does not expand ~", () => {
    const result = resolveVault({
      cliPath: "~/.vault",
      env: {},
      cwd,
      homeDir: home,
    });
    expect(result).toBe(path.resolve(cwd, "~", ".vault"));
    expect(result).not.toBe(path.join(home, ".vault"));
  });

  it("rejects a blank --vault value as usage error (exit 2)", () => {
    let caught: unknown;
    try {
      resolveVault({ cliPath: "  ", env: {}, cwd, homeDir: home });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UsageError);
    expect((caught as UsageError).exitCode).toBe(EXIT.USAGE);
    expect((caught as UsageError).message).toContain("--vault");
  });
});
