import {
  existsSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parsePrompt } from "../../src/core/prompt.js";
import { makeTempDir, removeTempDir, runCli } from "../helpers/run-cli.js";

const temps: string[] = [];

function temp(prefix: string): string {
  const dir = makeTempDir(prefix);
  temps.push(dir);
  return dir;
}

function bodyFile(
  dir: string,
  content: string | Buffer,
  name = "body.md",
): string {
  const file = path.join(dir, name);
  writeFileSync(file, content);
  return file;
}

afterAll(() => {
  for (const dir of temps) {
    removeTempDir(dir);
  }
});

describe("promptvault add", () => {
  it("writes a canonical prompt file and reports on stderr only", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const file = bodyFile(work, "Review the following {{language}} code.\n");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "add",
      "code-review",
      "--title",
      "Review a code change",
      "--file",
      file,
      "--tags",
      "review, development",
    ]);

    expect(status).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe('promptvault: added prompt "code-review"\n');
    const stored = readFileSync(
      path.join(vault, "prompts", "code-review.md"),
      "utf8",
    );
    expect(parsePrompt(Buffer.from(stored, "utf8"))).toEqual({
      schemaVersion: 1,
      id: "code-review",
      title: "Review a code change",
      tags: ["development", "review"],
      body: "Review the following {{language}} code.\n",
    });
    expect(stored.startsWith("---\nschemaVersion: 1\n")).toBe(true);
  });

  it("leaves the --file source byte-identical after a successful add", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    // CRLF on purpose: add canonicalizes the stored copy, never the source.
    const source = bodyFile(work, "Keep me intact.\r\nSecond line.\n");
    const before = readFileSync(source);

    const { status } = runCli([
      "--vault",
      vault,
      "add",
      "source-check",
      "--title",
      "Source check",
      "--file",
      source,
    ]);

    expect(status).toBe(0);
    expect(readFileSync(source).equals(before)).toBe(true);
  });

  it("accepts --vault after the subcommand (D18)", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const file = bodyFile(work, "Body\n");

    const { status, stderr } = runCli([
      "add",
      "a",
      "--title",
      "A",
      "--file",
      file,
      "--vault",
      vault,
    ]);

    expect(status).toBe(0);
    expect(stderr).toBe('promptvault: added prompt "a"\n');
    expect(existsSync(path.join(vault, "prompts", "a.md"))).toBe(true);
  });

  it("trims the title and canonicalizes tags (D10, D38)", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const file = bodyFile(work, "Body\n");

    const { status } = runCli([
      "--vault",
      vault,
      "add",
      "b",
      "--title",
      "  Spaced  ",
      "--file",
      file,
      "--tags",
      "z,a,m,z",
    ]);

    expect(status).toBe(0);
    const stored = readFileSync(path.join(vault, "prompts", "b.md"), "utf8");
    expect(parsePrompt(Buffer.from(stored, "utf8"))).toEqual({
      schemaVersion: 1,
      id: "b",
      title: "Spaced",
      tags: ["a", "m", "z"],
      body: "Body\n",
    });
  });

  it("refuses to overwrite an existing prompt (exit 2)", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const first = bodyFile(work, "one\n");
    const second = bodyFile(work, "two\n", "body2.md");

    const firstRun = runCli([
      "--vault",
      vault,
      "add",
      "dup",
      "--title",
      "Dup",
      "--file",
      first,
    ]);
    const secondRun = runCli([
      "--vault",
      vault,
      "add",
      "dup",
      "--title",
      "Dup",
      "--file",
      second,
    ]);

    expect(firstRun.status).toBe(0);
    expect(secondRun.status).toBe(2);
    expect(secondRun.stdout).toBe("");
    expect(secondRun.stderr).toContain("prompt already exists: dup");
    const stored = readFileSync(path.join(vault, "prompts", "dup.md"), "utf8");
    expect(stored).toContain("one");
  });

  it("requires an initialized vault (exit 2 with init hint)", () => {
    const vault = path.join(temp("pv-add-"), "vault");
    const work = temp("pv-add-work-");
    const file = bodyFile(work, "Body\n");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "add",
      "a",
      "--title",
      "A",
      "--file",
      file,
    ]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("vault not initialized");
    expect(stderr).toContain("promptvault init");
    expect(existsSync(vault)).toBe(false);
  });

  it("rejects invalid ids and never writes outside prompts/", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const file = bodyFile(work, "Body\n");

    for (const bad of ["Bad", "..", "a/b", "a\\b", ""]) {
      const { status, stdout, stderr } = runCli([
        "--vault",
        vault,
        "add",
        bad,
        "--title",
        "T",
        "--file",
        file,
      ]);
      expect(status).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("invalid id");
    }
    expect(readdirSync(path.join(vault, "prompts"))).toEqual([]);
  });

  it("rejects invalid titles (exit 2)", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const file = bodyFile(work, "Body\n");

    for (const title of ["", "   ", "two\nlines", "t".repeat(121)]) {
      const { status, stdout, stderr } = runCli([
        "--vault",
        vault,
        "add",
        "ok",
        "--title",
        title,
        "--file",
        file,
      ]);
      expect(status).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("invalid title");
    }
    expect(readdirSync(path.join(vault, "prompts"))).toEqual([]);
  });

  it("rejects invalid or empty tags (exit 2)", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const file = bodyFile(work, "Body\n");

    for (const csv of ["Review", "a,,b", ""]) {
      const { status, stdout, stderr } = runCli([
        "--vault",
        vault,
        "add",
        "ok",
        "--title",
        "Ok",
        "--file",
        file,
        "--tags",
        csv,
      ]);
      expect(status).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toMatch(/invalid --tags value|invalid tag/);
    }
    expect(readdirSync(path.join(vault, "prompts"))).toEqual([]);
  });

  it("requires --title", () => {
    const vault = temp("pv-add-");
    runCli(["--vault", vault, "init"]);

    const { status, stdout, stderr } = runCli(["--vault", vault, "add", "a"]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("promptvault: error:");
  });

  it("requires exactly one body source, checked before any read", () => {
    const vault = temp("pv-add-");
    runCli(["--vault", vault, "init"]);

    const missing = runCli(["--vault", vault, "add", "a", "--title", "A"]);
    expect(missing.status).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toBe(
      "promptvault: error: missing body source: use --file <path> or --clipboard\n",
    );

    // The file path does not exist on purpose: the conflict must be reported
    // without attempting to read the file (and before any clipboard access).
    const conflicting = runCli([
      "--vault",
      vault,
      "add",
      "a",
      "--title",
      "A",
      "--file",
      path.join(vault, "missing-body.md"),
      "--clipboard",
    ]);
    expect(conflicting.status).toBe(2);
    expect(conflicting.stdout).toBe("");
    expect(conflicting.stderr).toBe(
      "promptvault: error: conflicting body sources: use --file <path> or --clipboard, not both\n",
    );
    expect(conflicting.stderr).not.toContain("cannot read body file");
    expect(readdirSync(path.join(vault, "prompts"))).toEqual([]);
  });

  it("documents --clipboard in add --help", () => {
    const { status, stdout, stderr } = runCli(["add", "--help"]);

    expect(status).toBe(0);
    expect(stdout).toContain("--clipboard");
    expect(stdout).toContain("--file <path>");
    expect(stderr).toBe("");
  });

  it("fails with exit 1 when the body file cannot be read", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "add",
      "a",
      "--title",
      "A",
      "--file",
      path.join(work, "missing.md"),
    ]);

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("cannot read body file");
  });

  it("rejects an oversized body (exit 2)", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const file = bodyFile(work, Buffer.alloc(1024 * 1024 + 1, 0x78));

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "add",
      "a",
      "--title",
      "A",
      "--file",
      file,
    ]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("too large");
  });

  it("rejects an empty or whitespace-only body (exit 2)", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);

    for (const [index, content] of ["", "   \n\t\n"].entries()) {
      const file = bodyFile(work, content, `empty-${index}.md`);
      const { status, stdout, stderr } = runCli([
        "--vault",
        vault,
        "add",
        "a",
        "--title",
        "A",
        "--file",
        file,
      ]);
      expect(status).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("empty prompt body");
    }
  });

  it("canonicalizes BOM and CRLF in the body", () => {
    const vault = temp("pv-add-");
    const work = temp("pv-add-work-");
    runCli(["--vault", vault, "init"]);
    const raw = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("Line one\r\nLine two\r\n", "utf8"),
    ]);
    const file = bodyFile(work, raw);

    const { status } = runCli([
      "--vault",
      vault,
      "add",
      "crlf",
      "--title",
      "CRLF",
      "--file",
      file,
    ]);

    expect(status).toBe(0);
    const stored = readFileSync(path.join(vault, "prompts", "crlf.md"), "utf8");
    expect(stored).not.toContain("\r");
    expect(stored).not.toContain("\uFEFF");
    expect(stored.endsWith("---\nLine one\nLine two\n")).toBe(true);
  });

  it("rejects a symlinked prompts directory with exit 1", () => {
    const vault = temp("pv-add-");
    const target = temp("pv-add-target-");
    const work = temp("pv-add-work-");
    const type = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(target, path.join(vault, "prompts"), type);
    const file = bodyFile(work, "Body\n");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "add",
      "a",
      "--title",
      "A",
      "--file",
      file,
    ]);

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("symbolic link");
    expect(readdirSync(target)).toEqual([]);
  });
});
