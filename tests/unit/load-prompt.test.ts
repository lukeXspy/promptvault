import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { serializePrompt } from "../../src/core/prompt.js";
import {
  InvalidPromptError,
  PromptNotFoundError,
  UsageError,
} from "../../src/shared/errors.js";
import { loadPrompt } from "../../src/storage/prompts.js";
import { makeTempDir, removeTempDir } from "../helpers/run-cli.js";

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
  body = "Body.\n",
): void {
  mkdirSync(path.join(vault, "prompts"), { recursive: true });
  writeFileSync(
    path.join(vault, "prompts", `${id}.md`),
    serializePrompt({ schemaVersion: 1, id, title, tags: [], body }),
  );
}

afterAll(() => {
  for (const dir of temps) {
    removeTempDir(dir);
  }
});

describe("loadPrompt", () => {
  it("loads a valid prompt", async () => {
    const vault = temp("pv-load-");
    seed(vault, "one", "One");

    const prompt = await loadPrompt(vault, "one");

    expect(prompt).toEqual({
      schemaVersion: 1,
      id: "one",
      title: "One",
      tags: [],
      body: "Body.\n",
    });
  });

  it("reports a missing file as not found (exit 3)", async () => {
    const vault = temp("pv-load-");
    mkdirSync(path.join(vault, "prompts"), { recursive: true });

    await expect(loadPrompt(vault, "missing")).rejects.toBeInstanceOf(
      PromptNotFoundError,
    );
    await expect(loadPrompt(vault, "missing")).rejects.toThrow(
      "prompt not found: missing",
    );
  });

  it("rejects a malformed id before any filesystem access (exit 3)", async () => {
    const vault = path.join(temp("pv-load-"), "never-created");

    for (const bad of ["Bad", "..", "a/b", "a\\b", ""]) {
      await expect(loadPrompt(vault, bad)).rejects.toBeInstanceOf(
        PromptNotFoundError,
      );
    }
  });

  it("reports a valid id in an uninitialized vault as a usage error (exit 2)", async () => {
    const vault = temp("pv-load-");

    await expect(loadPrompt(vault, "one")).rejects.toBeInstanceOf(UsageError);
  });

  it("rejects an addressed file with invalid content (exit 2)", async () => {
    const vault = temp("pv-load-");
    mkdirSync(path.join(vault, "prompts"), { recursive: true });
    writeFileSync(
      path.join(vault, "prompts", "broken.md"),
      "no front matter\n",
    );

    await expect(loadPrompt(vault, "broken")).rejects.toBeInstanceOf(
      InvalidPromptError,
    );
    await expect(loadPrompt(vault, "broken")).rejects.toThrow(
      /invalid prompt file broken\.md: missing front matter/,
    );
  });

  it("rejects a name/id mismatch in the addressed file (D40)", async () => {
    const vault = temp("pv-load-");
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

    await expect(loadPrompt(vault, "wrong")).rejects.toThrow(
      /wrong\.md: file name does not match id "right"/,
    );
    await expect(loadPrompt(vault, "right")).rejects.toBeInstanceOf(
      PromptNotFoundError,
    );
  });

  it("rejects a symlink or a directory at the addressed name (exit 2)", async () => {
    const vault = temp("pv-load-");
    const target = temp("pv-load-");
    mkdirSync(path.join(vault, "prompts", "dir.md"), { recursive: true });
    symlinkSync(
      target,
      path.join(vault, "prompts", "link.md"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(loadPrompt(vault, "link")).rejects.toThrow(
      /invalid prompt file link\.md: symbolic link/,
    );
    await expect(loadPrompt(vault, "dir")).rejects.toThrow(
      /invalid prompt file dir\.md: not a regular file/,
    );
  });
});
