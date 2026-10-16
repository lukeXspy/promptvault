import { mkdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { serializePrompt } from "../../src/core/prompt.js";
import { makeTempDir, removeTempDir, runCli } from "../helpers/run-cli.js";

const temps: string[] = [];

function temp(prefix: string): string {
  const dir = makeTempDir(prefix);
  temps.push(dir);
  return dir;
}

function seed(vault: string, id: string, body = "Body.\n"): void {
  mkdirSync(path.join(vault, "prompts"), { recursive: true });
  writeFileSync(
    path.join(vault, "prompts", `${id}.md`),
    serializePrompt({ schemaVersion: 1, id, title: "T", tags: [], body }),
  );
}

afterAll(() => {
  for (const dir of temps) {
    removeTempDir(dir);
  }
});

describe("promptvault doctor", () => {
  it("reports a clean vault in ordinal order with exit 0", () => {
    const vault = temp("pv-doctor-");
    seed(vault, "zulu");
    seed(vault, "alpha");
    seed(vault, "mike");

    const { status, stdout, stderr } = runCli(["--vault", vault, "doctor"]);

    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(
      `vault: ${vault}\n` +
        "prompts: 3 file(s)\n" +
        "OK     alpha.md\n" +
        "OK     mike.md\n" +
        "OK     zulu.md\n" +
        "summary: 3 ok, 0 error\n",
    );
  });

  it("reports a broken file among valid ones with exit 2 and full output", () => {
    const vault = temp("pv-doctor-");
    seed(vault, "alpha");
    writeFileSync(
      path.join(vault, "prompts", "broken.md"),
      "no front matter\n",
    );

    const { status, stdout, stderr } = runCli(["--vault", vault, "doctor"]);

    expect(status).toBe(2);
    expect(stderr).toBe("");
    expect(stdout).toBe(
      `vault: ${vault}\n` +
        "prompts: 2 file(s)\n" +
        "OK     alpha.md\n" +
        "ERROR  broken.md: missing front matter: the file must start with a '---' line\n" +
        "summary: 1 ok, 1 error\n",
    );
  });

  it("reports stray entries, subdirectories and symlinks together", () => {
    const vault = temp("pv-doctor-");
    const linkTarget = temp("pv-doctor-");
    seed(vault, "ok");
    writeFileSync(path.join(vault, "prompts", "notes.txt"), "x");
    mkdirSync(path.join(vault, "prompts", "sub"));
    symlinkSync(
      linkTarget,
      path.join(vault, "prompts", "link.md"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const { status, stdout } = runCli(["--vault", vault, "doctor"]);

    expect(status).toBe(2);
    expect(stdout).toBe(
      `vault: ${vault}\n` +
        "prompts: 4 file(s)\n" +
        "ERROR  link.md: symbolic link\n" +
        "ERROR  notes.txt: not a .md file\n" +
        "OK     ok.md\n" +
        "ERROR  sub: not a regular file\n" +
        "summary: 1 ok, 3 error\n",
    );
  });

  it("reports a file whose name does not match its id (D40)", () => {
    const vault = temp("pv-doctor-");
    mkdirSync(path.join(vault, "prompts"), { recursive: true });
    writeFileSync(
      path.join(vault, "prompts", "other.md"),
      serializePrompt({
        schemaVersion: 1,
        id: "mine",
        title: "Mine",
        tags: [],
        body: "Body.\n",
      }),
    );

    const { status, stdout } = runCli(["--vault", vault, "doctor"]);

    expect(status).toBe(2);
    expect(stdout).toContain(
      'ERROR  other.md: file name does not match id "mine"\n',
    );
    expect(stdout).toContain("summary: 0 ok, 1 error\n");
  });

  it("reports an uninitialized vault as a problem with exit 2", () => {
    const vault = path.join(temp("pv-doctor-"), "missing");

    const { status, stdout, stderr } = runCli(["--vault", vault, "doctor"]);

    expect(status).toBe(2);
    expect(stderr).toBe("");
    expect(stdout).toBe(
      `vault: ${vault}\n` +
        'ERROR  vault not initialized; run "promptvault init"\n' +
        "summary: 0 ok, 1 error\n",
    );
  });

  it("treats an empty prompts directory as clean (exit 0)", () => {
    const vault = temp("pv-doctor-");
    mkdirSync(path.join(vault, "prompts"), { recursive: true });

    const { status, stdout, stderr } = runCli(["--vault", vault, "doctor"]);

    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(
      `vault: ${vault}\n` + "prompts: 0 file(s)\n" + "summary: 0 ok, 0 error\n",
    );
  });

  it("never mutates the vault and never prints bodies", () => {
    const vault = temp("pv-doctor-");
    seed(vault, "good", "SECRET BODY\n");
    writeFileSync(
      path.join(vault, "prompts", "broken.md"),
      "no front matter\n",
    );
    const files = ["good.md", "broken.md"].map((name) => {
      const target = path.join(vault, "prompts", name);
      const stats = statSync(target);
      return { target, size: stats.size, mtimeMs: stats.mtimeMs };
    });

    const { stdout } = runCli(["--vault", vault, "doctor"]);

    expect(stdout).not.toContain("SECRET BODY");
    for (const before of files) {
      const after = statSync(before.target);
      expect(after.size).toBe(before.size);
      expect(after.mtimeMs).toBe(before.mtimeMs);
    }
  });

  it("exits 1 with no report when the vault cannot be read", () => {
    const vault = temp("pv-doctor-");
    const target = temp("pv-doctor-");
    symlinkSync(
      target,
      path.join(vault, "prompts"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const { status, stdout, stderr } = runCli(["--vault", vault, "doctor"]);

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      "promptvault: error: vault path is a symbolic link, refusing to use it: " +
        `${path.join(vault, "prompts")}\n`,
    );
  });
});
