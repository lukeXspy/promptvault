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

function seed(vault: string, id: string, body: string): void {
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

describe("promptvault render", () => {
  it("prints only the rendered body on stdout, spaces and repeats included", () => {
    const vault = temp("pv-render-");
    seed(vault, "one", "Review the {{ language }} {{language}} code.\n");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "render",
      "one",
      "--var",
      "language=TypeScript",
    ]);

    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("Review the TypeScript TypeScript code.\n");
  });

  it("keeps `=` inside values and supports empty values", () => {
    const vault = temp("pv-render-");
    seed(vault, "one", "[{{token}}] [{{empty}}]\n");

    const { status, stdout } = runCli([
      "--vault",
      vault,
      "render",
      "one",
      "--var",
      "token=a=b",
      "--var",
      "empty=",
    ]);

    expect(status).toBe(0);
    expect(stdout).toBe("[a=b] []\n");
  });

  it("never re-scans inserted values", () => {
    const vault = temp("pv-render-");
    seed(vault, "one", "{{a}}\n");

    const { status, stdout } = runCli([
      "--vault",
      vault,
      "render",
      "one",
      "--var",
      "a={{b}}",
    ]);

    expect(status).toBe(0);
    expect(stdout).toBe("{{b}}\n");
  });

  it("leaves malformed and nested brace structures literal", () => {
    const vault = temp("pv-render-");
    seed(vault, "wrong", "{{a-b}} {{}} {{1x}}\n");
    seed(vault, "nested", "{{a{{b}}}}\n");

    const wrong = runCli(["--vault", vault, "render", "wrong"]);
    expect(wrong.status).toBe(0);
    expect(wrong.stdout).toBe("{{a-b}} {{}} {{1x}}\n");

    const nested = runCli([
      "--vault",
      vault,
      "render",
      "nested",
      "--var",
      "b=X",
    ]);
    expect(nested.status).toBe(0);
    expect(nested.stdout).toBe("{{aX}}\n");
  });

  it("rejects missing values with nothing on stdout and no value leak", () => {
    const vault = temp("pv-render-");
    seed(vault, "one", "{{x}} {{y}}\n");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "render",
      "one",
      "--var",
      "y=TOP_SECRET",
    ]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("missing variables: x");
    expect(stderr).not.toContain("TOP_SECRET");
  });

  it("rejects unused values with nothing on stdout and no value leak", () => {
    const vault = temp("pv-render-");
    seed(vault, "one", "{{x}}\n");

    const { status, stdout, stderr } = runCli([
      "--vault",
      vault,
      "render",
      "one",
      "--var",
      "x=1",
      "--var",
      "y=TOP_SECRET",
    ]);

    expect(status).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("unused variables: y");
    expect(stderr).not.toContain("TOP_SECRET");
  });

  it("rejects duplicate keys and malformed pairs (exit 2)", () => {
    const vault = temp("pv-render-");
    seed(vault, "one", "{{x}}\n");

    const dup = runCli([
      "--vault",
      vault,
      "render",
      "one",
      "--var",
      "x=1",
      "--var",
      "x=2",
    ]);
    expect(dup.status).toBe(2);
    expect(dup.stdout).toBe("");
    expect(dup.stderr).toContain("duplicate --var key: x");

    const noEq = runCli(["--vault", vault, "render", "one", "--var", "foo"]);
    expect(noEq.status).toBe(2);
    expect(noEq.stdout).toBe("");
    expect(noEq.stderr).toContain("invalid --var: expected key=value");

    const badKey = runCli(["--vault", vault, "render", "one", "--var", "1a=x"]);
    expect(badKey.status).toBe(2);
    expect(badKey.stdout).toBe("");
    expect(badKey.stderr).toContain('invalid --var key "1a"');
  });

  it("fails the same way as show for a missing or invalid prompt", () => {
    const vault = temp("pv-render-");
    seed(vault, "good", "Body.\n");

    const missing = runCli(["--vault", vault, "render", "nope"]);
    expect(missing.status).toBe(3);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("prompt not found: nope");

    writeFileSync(
      path.join(vault, "prompts", "broken.md"),
      "no front matter\n",
    );
    const broken = runCli(["--vault", vault, "render", "broken"]);
    expect(broken.status).toBe(2);
    expect(broken.stdout).toBe("");
    expect(broken.stderr).toContain("broken.md");

    const unaffected = runCli(["--vault", vault, "render", "good"]);
    expect(unaffected.status).toBe(0);
    expect(unaffected.stdout).toBe("Body.\n");
  });
});
