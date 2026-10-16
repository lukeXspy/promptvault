import { describe, expect, it } from "vitest";
import { VERSION } from "../../src/version.js";
import { runCli } from "../helpers/run-cli.js";

describe("promptvault CLI smoke", () => {
  it("prints usage on --help and exits 0", () => {
    const { status, stdout, stderr } = runCli(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("Usage: promptvault");
    expect(stdout).toContain("init");
    expect(stderr).toBe("");
  });

  it("prints the version on --version and exits 0", () => {
    const { status, stdout } = runCli(["--version"]);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe(VERSION);
  });

  it("exits 2 with usage on stderr when no command is given", () => {
    const { status, stdout, stderr } = runCli([]);
    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("Usage: promptvault");
  });

  it("exits 2 for an unknown command", () => {
    const { status, stdout, stderr } = runCli(["definitely-not-a-command"]);
    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain(
      "promptvault: error: unknown command 'definitely-not-a-command'",
    );
  });

  it("exits 2 for the removed implicit help subcommand", () => {
    const { status, stdout, stderr } = runCli(["help"]);
    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("unknown command 'help'");
  });

  it("exits 2 for an unknown option with the promptvault prefix", () => {
    const { status, stderr } = runCli(["--definitely-not-an-option"]);
    expect(status).toBe(2);
    expect(stderr).toContain("promptvault: error: unknown option");
  });

  it("exits 2 on excess arguments for a command that takes none", () => {
    const { status, stdout, stderr } = runCli(["list", "extra"]);
    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("too many arguments for 'list'");
  });

  it("exits 2 on excess arguments for a command that takes one", () => {
    const { status, stdout, stderr } = runCli(["show", "code-review", "extra"]);
    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("too many arguments for 'show'");
  });

  it("exits 2 when a global option value is missing", () => {
    const { status, stderr } = runCli(["--vault"]);
    expect(status).toBe(2);
    expect(stderr).toContain(
      "promptvault: error: option '--vault <path>' argument missing",
    );
  });
});
