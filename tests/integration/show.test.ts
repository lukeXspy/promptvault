import { mkdirSync, writeFileSync } from "node:fs";
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

function seed(
  vault: string,
  id: string,
  title: string,
  body: string,
  tags: string[] = [],
): void {
  mkdirSync(path.join(vault, "prompts"), { recursive: true });
  writeFileSync(
    path.join(vault, "prompts", `${id}.md`),
    serializePrompt({ schemaVersion: 1, id, title, tags, body }),
  );
}

afterAll(() => {
  for (const dir of temps) {
    removeTempDir(dir);
  }
});

describe("promptvault show", () => {
  it("prints the body byte-exact with no added trailing newline", () => {
    const vault = temp("pv-show-");
    seed(vault, "one", "One", "Line one\nLine two");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "show",
      "one",
    ]);

    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("Line one\nLine two");
  });

  it("preserves a trailing newline that exists in the body", () => {
    const vault = temp("pv-show-");
    seed(vault, "one", "One", "Body.\n");

    const { status, stdout } = runCli(["--vault", vault, "show", "one"]);

    expect(status).toBe(0);
    expect(stdout).toBe("Body.\n");
  });

  it("prints control characters exactly as stored (raw, D45)", () => {
    const vault = temp("pv-show-");
    seed(vault, "raw", "Raw", "a\u001b[31mb\n");

    const { status, stdout } = runCli(["--vault", vault, "show", "raw"]);

    expect(status).toBe(0);
    expect(stdout).toBe("a\u001b[31mb\n");
  });

  it("round-trips a prompt added through the CLI", () => {
    const vault = temp("pv-show-");
    const work = temp("pv-show-work-");
    runCli(["--vault", vault, "init"]);
    const file = path.join(work, "body.md");
    writeFileSync(file, "Hello.\n");

    const added = runCli([
      "--vault",
      vault,
      "add",
      "one",
      "--title",
      "One",
      "--file",
      file,
    ]);
    expect(added.status).toBe(0);

    const { status, stdout } = runCli(["--vault", vault, "show", "one"]);
    expect(status).toBe(0);
    expect(stdout).toBe("Hello.\n");
  });

  it("accepts --vault after the subcommand (D18)", () => {
    const vault = temp("pv-show-");
    seed(vault, "one", "One", "Body.\n");

    const { status, stdout } = runCli(["show", "one", "--vault", vault]);

    expect(status).toBe(0);
    expect(stdout).toBe("Body.\n");
  });

  it("exits 3 for a missing prompt with nothing on stdout", () => {
    const vault = temp("pv-show-");
    runCli(["--vault", vault, "init"]);

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "show",
      "missing",
    ]);

    expect(status).toBe(3);
    expect(stdout).toBe("");
    expect(stderr).toContain("prompt not found: missing");
  });

  it("treats a malformed id as not found (exit 3) before touching the vault", () => {
    const vault = path.join(temp("pv-show-"), "vault");

    for (const bad of ["Bad", "..", "a/b", ""]) {
      const { status, stdout, stderr } = runCli([
        "--vault",
        vault,
        "show",
        bad,
      ]);
      expect(status).toBe(3);
      expect(stdout).toBe("");
      expect(stderr).toContain("prompt not found: ");
    }
  });

  it("exits 2 for a valid id in an uninitialized vault (init hint)", () => {
    const vault = path.join(temp("pv-show-"), "vault");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "show",
      "missing",
    ]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("vault not initialized");
  });

  it("exits 2 for an invalid addressed file with no partial output", () => {
    const vault = temp("pv-show-");
    seed(vault, "good", "Good", "Body.\n");
    writeFileSync(
      path.join(vault, "prompts", "broken.md"),
      "no front matter\n",
    );

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "show",
      "broken",
    ]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("invalid prompt file broken.md");
    expect(stderr).toContain("missing front matter");
  });

  it("addresses the file by name and validates its id (D40)", () => {
    const vault = temp("pv-show-");
    mkdirSync(path.join(vault, "prompts"), { recursive: true });
    writeFileSync(
      path.join(vault, "prompts", "wrong.md"),
      serializePrompt({
        schemaVersion: 1,
        id: "right",
        title: "Right",
        tags: [],
        body: "Body.\n",
      }),
    );

    const mismatch = runCli(["--vault", vault, "show", "wrong"]);
    expect(mismatch.status).toBe(2);
    expect(mismatch.stdout).toBe("");
    expect(mismatch.stderr).toContain('file name does not match id "right"');

    const missing = runCli(["--vault", vault, "show", "right"]);
    expect(missing.status).toBe(3);
    expect(missing.stdout).toBe("");
  });
});
