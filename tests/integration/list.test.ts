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
  tags: string[] = [],
): void {
  mkdirSync(path.join(vault, "prompts"), { recursive: true });
  writeFileSync(
    path.join(vault, "prompts", `${id}.md`),
    serializePrompt({
      schemaVersion: 1,
      id,
      title,
      tags,
      body: `Body of ${id}.\n`,
    }),
  );
}

afterAll(() => {
  for (const dir of temps) {
    removeTempDir(dir);
  }
});

describe("promptvault list", () => {
  it("prints id<TAB>title lines in ordinal order on stdout only", () => {
    const vault = temp("pv-list-");
    seed(vault, "zulu", "Zulu task");
    seed(vault, "code-review", "Review a code change", [
      "development",
      "review",
    ]);
    seed(vault, "alpha", "Alpha task");

    const { status, stdout, stderr } = runCli(["--vault", vault, "list"]);

    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(
      "alpha\tAlpha task\ncode-review\tReview a code change\nzulu\tZulu task\n",
    );
  });

  it("accepts --vault after the subcommand (D18)", () => {
    const vault = temp("pv-list-");
    seed(vault, "one", "One");

    const { status, stdout } = runCli(["list", "--vault", vault]);

    expect(status).toBe(0);
    expect(stdout).toBe("one\tOne\n");
  });

  it("round-trips prompts added through the CLI", () => {
    const vault = temp("pv-list-");
    const work = temp("pv-list-work-");
    runCli(["--vault", vault, "init"]);
    const file = path.join(work, "body.md");
    writeFileSync(file, "Body.\n");

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

    const { status, stdout } = runCli(["--vault", vault, "list"]);
    expect(status).toBe(0);
    expect(stdout).toBe("one\tOne\n");
  });

  it("renders an empty vault as no bytes or []", () => {
    const vault = temp("pv-list-");
    runCli(["--vault", vault, "init"]);

    const human = runCli(["--vault", vault, "list"]);
    expect(human.status).toBe(0);
    expect(human.stdout).toBe("");
    expect(human.stderr).toBe("");

    const json = runCli(["--vault", vault, "list", "--json"]);
    expect(json.status).toBe(0);
    expect(json.stdout).toBe("[]\n");
    expect(json.stderr).toBe("");
  });

  it("prints pure pretty JSON with the fixed key order", () => {
    const vault = temp("pv-list-");
    seed(vault, "code-review", "Review a code change", [
      "development",
      "review",
    ]);

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "list",
      "--json",
    ]);

    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.endsWith("\n")).toBe(true);
    expect(JSON.parse(stdout)).toEqual([
      {
        id: "code-review",
        title: "Review a code change",
        tags: ["development", "review"],
      },
    ]);
    expect(stdout.indexOf('"id"')).toBeLessThan(stdout.indexOf('"title"'));
    expect(stdout.indexOf('"title"')).toBeLessThan(stdout.indexOf('"tags"'));
  });

  it("filters by tag with --tag (exact match)", () => {
    const vault = temp("pv-list-");
    seed(vault, "a", "A", ["review"]);
    seed(vault, "b", "B", ["other"]);
    seed(vault, "c", "C", ["review", "other"]);

    const { status, stdout } = runCli([
      "--vault",
      vault,
      "list",
      "--tag",
      "review",
    ]);
    expect(status).toBe(0);
    expect(stdout).toBe("a\tA\nc\tC\n");

    const noMatch = runCli([
      "--vault",
      vault,
      "list",
      "--tag",
      "missing",
      "--json",
    ]);
    expect(noMatch.status).toBe(0);
    expect(noMatch.stdout).toBe("[]\n");
  });

  it("rejects an invalid --tag value (exit 2)", () => {
    const vault = temp("pv-list-");
    runCli(["--vault", vault, "init"]);

    for (const bad of ["Review", "two words", ""]) {
      const { status, stdout, stderr } = runCli([
        "--vault",
        vault,
        "list",
        "--tag",
        bad,
      ]);
      expect(status).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain("invalid tag");
    }
  });

  it("requires an initialized vault (exit 2 with init hint)", () => {
    const vault = path.join(temp("pv-list-"), "vault");

    const { status, stdout, stderr } = runCli(["--vault", vault, "list"]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("vault not initialized");
  });

  it("fails the whole command on any invalid entry, with no partial output", () => {
    const vault = temp("pv-list-");
    seed(vault, "good", "Good");
    writeFileSync(
      path.join(vault, "prompts", "broken.md"),
      "no front matter\n",
    );

    const human = runCli(["--vault", vault, "list"]);
    expect(human.status).toBe(2);
    expect(human.stdout).toBe("");
    expect(human.stderr).toContain("broken.md");
    expect(human.stderr).toContain("missing front matter");

    const json = runCli(["--vault", vault, "list", "--json"]);
    expect(json.status).toBe(2);
    expect(json.stdout).toBe("");
  });

  it("escapes control characters in titles (human and JSON)", () => {
    const vault = temp("pv-list-");
    const work = temp("pv-list-work-");
    runCli(["--vault", vault, "init"]);
    const file = path.join(work, "body.md");
    writeFileSync(file, "Body.\n");

    const added = runCli([
      "--vault",
      vault,
      "add",
      "evil",
      "--title",
      "red\u001b[31mand\tblue",
      "--file",
      file,
    ]);
    expect(added.status).toBe(0);

    const human = runCli(["--vault", vault, "list"]);
    expect(human.status).toBe(0);
    expect(human.stdout).not.toMatch(/\u001b/);
    expect(human.stdout).toContain("\\u001b[31m");

    const json = runCli(["--vault", vault, "list", "--json"]);
    expect(json.status).toBe(0);
    expect(json.stdout).not.toMatch(/\u001b/);
    expect(JSON.parse(json.stdout)).toEqual([
      { id: "evil", title: "red\\u001b[31mand\tblue", tags: [] },
    ]);
  });
});
