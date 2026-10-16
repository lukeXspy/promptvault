import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { serializePrompt } from "../../src/core/prompt.js";
import {
  CreationConflictError,
  EXIT,
  InvalidPromptError,
  IoError,
  UsageError,
} from "../../src/shared/errors.js";
import {
  loadAllPrompts,
  readBodyFile,
  resolvePromptsDir,
  writePromptExclusive,
} from "../../src/storage/prompts.js";
import { makeTempDir, removeTempDir } from "../helpers/run-cli.js";

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

describe("resolvePromptsDir", () => {
  it("returns the real path of an existing prompts directory", async () => {
    const vault = temp("pv-store-");
    mkdirSync(path.join(vault, "prompts"));
    // Expected canonicalization uses fs/promises realpath, the same API as
    // the command contract: realpathSync keeps Windows alias forms (D61).
    await expect(resolvePromptsDir(vault)).resolves.toBe(
      await realpath(path.join(vault, "prompts")),
    );
  });

  it("reports an uninitialized vault as a usage error (exit 2)", async () => {
    const vault = temp("pv-store-");
    await expect(resolvePromptsDir(vault)).rejects.toBeInstanceOf(UsageError);
    await expect(resolvePromptsDir(vault)).rejects.toMatchObject({
      exitCode: EXIT.USAGE,
    });
    await expect(resolvePromptsDir(vault)).rejects.toThrow(/not initialized/);
  });

  it("rejects a prompts path blocked by a file (exit 1)", async () => {
    const vault = temp("pv-store-");
    writeFileSync(path.join(vault, "prompts"), "x");
    await expect(resolvePromptsDir(vault)).rejects.toBeInstanceOf(IoError);
    await expect(resolvePromptsDir(vault)).rejects.toThrow(/not a directory/);
  });

  it("rejects a symlinked prompts directory (exit 1)", async () => {
    const vault = temp("pv-store-");
    const target = temp("pv-store-");
    const type = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(target, path.join(vault, "prompts"), type);
    await expect(resolvePromptsDir(vault)).rejects.toBeInstanceOf(IoError);
    await expect(resolvePromptsDir(vault)).rejects.toThrow(/symbolic link/);
  });
});

describe("readBodyFile", () => {
  it("reads raw bytes unchanged", async () => {
    const dir = temp("pv-store-");
    const file = path.join(dir, "body.md");
    writeFileSync(file, "hello\r\nworld");
    const bytes = await readBodyFile(file);
    expect(Buffer.from(bytes).toString("utf8")).toBe("hello\r\nworld");
  });

  it("maps unreadable files to I/O errors (exit 1)", async () => {
    const dir = temp("pv-store-");
    const missing = path.join(dir, "missing.md");
    await expect(readBodyFile(missing)).rejects.toBeInstanceOf(IoError);
    await expect(readBodyFile(missing)).rejects.toThrow(
      /cannot read body file/,
    );
  });
});

describe("writePromptExclusive", () => {
  it("creates the file and never overwrites it", async () => {
    const vault = temp("pv-store-");
    mkdirSync(path.join(vault, "prompts"));
    const promptsDir = await resolvePromptsDir(vault);
    const target = path.join(promptsDir, "a.md");

    await writePromptExclusive(promptsDir, "a", "first");
    expect(readFileSync(target, "utf8")).toBe("first");

    await expect(
      writePromptExclusive(promptsDir, "a", "second"),
    ).rejects.toBeInstanceOf(CreationConflictError);
    await expect(
      writePromptExclusive(promptsDir, "a", "second"),
    ).rejects.toThrow(/already exists: a/);
    expect(readFileSync(target, "utf8")).toBe("first");
  });
});

function seedPrompt(
  vault: string,
  id: string,
  title: string,
  tags: string[] = [],
): void {
  mkdirSync(path.join(vault, "prompts"), { recursive: true });
  writeFileSync(
    path.join(vault, "prompts", `${id}.md`),
    serializePrompt({ schemaVersion: 1, id, title, tags, body: "Body.\n" }),
  );
}

describe("loadAllPrompts", () => {
  it("loads every valid prompt sorted by id (D4)", async () => {
    const vault = temp("pv-store-");
    seedPrompt(vault, "zulu", "Zulu");
    seedPrompt(vault, "alpha", "Alpha", ["a"]);
    seedPrompt(vault, "mike", "Mike");

    const prompts = await loadAllPrompts(vault);

    expect(prompts.map((prompt) => prompt.id)).toEqual([
      "alpha",
      "mike",
      "zulu",
    ]);
    expect(prompts[0]).toEqual({
      schemaVersion: 1,
      id: "alpha",
      title: "Alpha",
      tags: ["a"],
      body: "Body.\n",
    });
  });

  it("accepts BOM and CRLF and returns the canonical body", async () => {
    const vault = temp("pv-store-");
    mkdirSync(path.join(vault, "prompts"), { recursive: true });
    const canonical = serializePrompt({
      schemaVersion: 1,
      id: "bom",
      title: "Bom",
      tags: [],
      body: "Body.\n",
    });
    writeFileSync(
      path.join(vault, "prompts", "bom.md"),
      `\uFEFF${canonical.replace(/\n/g, "\r\n")}`,
    );

    const prompts = await loadAllPrompts(vault);

    expect(prompts[0]?.body).toBe("Body.\n");
  });

  it("reports an uninitialized vault as a usage error (exit 2)", async () => {
    const vault = temp("pv-store-");
    await expect(loadAllPrompts(vault)).rejects.toBeInstanceOf(UsageError);
  });

  it("reports stray files, subdirectories and symlinks together", async () => {
    const vault = temp("pv-store-");
    const target = temp("pv-store-");
    seedPrompt(vault, "ok", "Ok");
    writeFileSync(path.join(vault, "prompts", "notes.txt"), "x");
    mkdirSync(path.join(vault, "prompts", "sub"));
    symlinkSync(
      target,
      path.join(vault, "prompts", "link"),
      process.platform === "win32" ? "junction" : "dir",
    );

    let caught: unknown = null;
    try {
      await loadAllPrompts(vault);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidPromptError);
    const message = (caught as Error).message;
    expect(message).toContain("invalid prompt file notes.txt: not a .md file");
    expect(message).toContain("invalid prompt file sub: not a regular file");
    expect(message).toContain("invalid prompt file link: symbolic link");
    expect(message).not.toContain("ok.md");
  });

  it("rejects content that fails to parse, naming the file", async () => {
    const vault = temp("pv-store-");
    mkdirSync(path.join(vault, "prompts"), { recursive: true });
    writeFileSync(
      path.join(vault, "prompts", "broken.md"),
      "no front matter\n",
    );

    await expect(loadAllPrompts(vault)).rejects.toThrow(
      /broken\.md: missing front matter/,
    );
  });

  it("rejects a file whose name does not match its id (D40)", async () => {
    const vault = temp("pv-store-");
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

    await expect(loadAllPrompts(vault)).rejects.toThrow(
      /wrong\.md: file name does not match id "right"/,
    );
  });

  it("collects findings from several files into one error", async () => {
    const vault = temp("pv-store-");
    seedPrompt(vault, "ok", "Ok");
    writeFileSync(path.join(vault, "prompts", "one.md"), "x");
    writeFileSync(path.join(vault, "prompts", "two.md"), "y");

    let caught: unknown = null;
    try {
      await loadAllPrompts(vault);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidPromptError);
    const message = (caught as Error).message;
    expect(message).toContain("one.md: missing front matter");
    expect(message).toContain("two.md: missing front matter");
    expect(message).toContain("; ");
  });
});
