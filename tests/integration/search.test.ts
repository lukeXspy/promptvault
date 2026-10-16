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

describe("promptvault search", () => {
  it("prints matching rows in ordinal order on stdout only", () => {
    const vault = temp("pv-search-");
    seed(vault, "zulu", "Zulu task", "Body.\n");
    seed(vault, "alpha", "Alpha security checklist", "Body.\n");
    seed(vault, "mike", "Mike task", "Security review notes.\n");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "search",
      "security",
    ]);

    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("alpha\tAlpha security checklist\nmike\tMike task\n");
  });

  it("matches case-insensitively in id, title, tag and body", () => {
    const vault = temp("pv-search-");
    seed(vault, "neon-guide", "Guide", "Body.\n");
    seed(vault, "a1", "Neon lights", "Body.\n");
    seed(vault, "a2", "Plain", "Body.\n", ["neon"]);
    seed(vault, "a3", "Plain", "Uses NEON intrinsics.\n");
    seed(vault, "zzz", "Unrelated", "Body.\n");

    const { status, stdout } = runCli(["--vault", vault, "search", "NEON"]);

    expect(status).toBe(0);
    expect(stdout).toBe(
      "a1\tNeon lights\na2\tPlain\na3\tPlain\nneon-guide\tGuide\n",
    );
  });

  it("treats a multi-word query as one literal substring", () => {
    const vault = temp("pv-search-");
    seed(
      vault,
      "code-quality",
      "Code quality guide",
      "Review the code later.\n",
      ["review"],
    );

    const none = runCli(["--vault", vault, "search", "code review"]);
    expect(none.status).toBe(0);
    expect(none.stdout).toBe("");

    const hit = runCli(["--vault", vault, "search", "code quality"]);
    expect(hit.status).toBe(0);
    expect(hit.stdout).toBe("code-quality\tCode quality guide\n");
  });

  it("combines the query with a --tag filter (exact match)", () => {
    const vault = temp("pv-search-");
    seed(vault, "a", "Alpha notes", "Body.\n", ["review"]);
    seed(vault, "b", "Alpha guide", "Body.\n", ["other"]);

    const filtered = runCli([
      "--vault",
      vault,
      "search",
      "alpha",
      "--tag",
      "review",
    ]);
    expect(filtered.status).toBe(0);
    expect(filtered.stdout).toBe("a\tAlpha notes\n");

    const noMatch = runCli([
      "--vault",
      vault,
      "search",
      "alpha",
      "--tag",
      "missing",
      "--json",
    ]);
    expect(noMatch.status).toBe(0);
    expect(noMatch.stdout).toBe("[]\n");
  });

  it("prints JSON with the list shape when asked", () => {
    const vault = temp("pv-search-");
    seed(vault, "one", "One", "Body.\n", ["review"]);

    const { status, stdout } = runCli([
      "--vault",
      vault,
      "search",
      "one",
      "--json",
    ]);

    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual([
      { id: "one", title: "One", tags: ["review"] },
    ]);
  });

  it("rejects an empty query before touching the vault (exit 2)", () => {
    const vault = path.join(temp("pv-search-"), "vault");

    const { status, stdout, stderr } = runCli(["--vault", vault, "search", ""]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("empty search query");
  });

  it("rejects a malformed --tag value (exit 2)", () => {
    const vault = temp("pv-search-");
    seed(vault, "one", "One", "Body.\n");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "search",
      "one",
      "--tag",
      "Bad",
    ]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("invalid tag");
  });

  it("fails the whole command on an invalid vault with no partial output", () => {
    const vault = temp("pv-search-");
    seed(vault, "good", "Good security notes", "Body.\n");
    writeFileSync(
      path.join(vault, "prompts", "broken.md"),
      "no front matter\n",
    );

    const human = runCli(["--vault", vault, "search", "security"]);
    expect(human.status).toBe(2);
    expect(human.stdout).toBe("");
    expect(human.stderr).toContain("broken.md");

    const json = runCli(["--vault", vault, "search", "security", "--json"]);
    expect(json.status).toBe(2);
    expect(json.stdout).toBe("");
  });

  it("treats no results as a quiet success (exit 0)", () => {
    const vault = temp("pv-search-");
    seed(vault, "one", "One", "Body.\n");

    const human = runCli(["--vault", vault, "search", "nonexistent"]);
    expect(human.status).toBe(0);
    expect(human.stdout).toBe("");
    expect(human.stderr).toBe("");

    const json = runCli(["--vault", vault, "search", "nonexistent", "--json"]);
    expect(json.status).toBe(0);
    expect(json.stdout).toBe("[]\n");
  });

  it("requires the query argument (exit 2)", () => {
    const vault = temp("pv-search-");

    const { status, stdout } = runCli(["--vault", vault, "search"]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
  });
});
