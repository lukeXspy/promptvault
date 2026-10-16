import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

const { readMock } = vi.hoisted(() => ({
  readMock: vi.fn<() => Promise<string>>(),
}));

vi.mock("clipboardy", () => ({
  default: { read: readMock, write: vi.fn() },
}));

import { registerAddCommand } from "../../src/cli/add-command.js";
import { parsePrompt, serializePrompt } from "../../src/core/prompt.js";
import {
  CreationConflictError,
  InvalidPromptError,
  IoError,
  UsageError,
} from "../../src/shared/errors.js";
import { makeTempDir, removeTempDir } from "../helpers/run-cli.js";

const temps: string[] = [];

function temp(prefix: string): string {
  const dir = makeTempDir(prefix);
  temps.push(dir);
  return dir;
}

/** An initialized vault (`prompts/` exists) without going through the CLI. */
function vaultWithPrompts(): string {
  const vault = temp("pv-add-clip-");
  mkdirSync(path.join(vault, "prompts"), { recursive: true });
  return vault;
}

function storedPath(vault: string, id: string): string {
  return path.join(vault, "prompts", `${id}.md`);
}

function build(): Command {
  const program = new Command();
  program
    .name("promptvault")
    .option("--vault <path>")
    .exitOverride()
    .addHelpCommand(false);
  registerAddCommand(program);
  return program;
}

/** Runs `add` in-process; resolves to the thrown error, or undefined. */
async function run(vault: string, args: string[]): Promise<unknown> {
  try {
    await build().parseAsync([
      "node",
      "promptvault",
      "--vault",
      vault,
      "add",
      ...args,
    ]);
    return undefined;
  } catch (error) {
    return error;
  }
}

function written(spy: MockInstance): string {
  return spy.mock.calls.map((call) => String(call[0])).join("");
}

let stdoutSpy: MockInstance;
let stderrSpy: MockInstance;

beforeEach(() => {
  readMock.mockReset();
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

afterAll(() => {
  for (const dir of temps) {
    removeTempDir(dir);
  }
});

describe("add --clipboard", () => {
  it("stores the clipboard text as the prompt body", async () => {
    const vault = vaultWithPrompts();
    const pasted = "Pasted line one.\n\n  indented line\nPasted line four.\n";
    readMock.mockResolvedValue(pasted);

    const error = await run(vault, [
      "pasted",
      "--title",
      "  Pasted from a chat  ",
      "--clipboard",
      "--tags",
      "chat, drafting",
    ]);

    expect(error).toBeUndefined();
    expect(readMock).toHaveBeenCalledTimes(1);
    const stored = parsePrompt(readFileSync(storedPath(vault, "pasted")));
    expect(stored).toEqual({
      schemaVersion: 1,
      id: "pasted",
      title: "Pasted from a chat",
      tags: ["chat", "drafting"],
      body: pasted,
    });
    expect(written(stdoutSpy)).toBe("");
    expect(written(stderrSpy)).toBe('promptvault: added prompt "pasted"\n');
  });

  it("keeps Unicode and multiple lines intact", async () => {
    const vault = vaultWithPrompts();
    const pasted = "Linha um — ação 🚀\n第二行\n\núltima linha\n";
    readMock.mockResolvedValue(pasted);

    const error = await run(vault, [
      "uni",
      "--title",
      "Unicode",
      "--clipboard",
    ]);

    expect(error).toBeUndefined();
    const stored = parsePrompt(readFileSync(storedPath(vault, "uni")));
    expect(stored.body).toBe(pasted);
  });

  it("strips a BOM and normalizes CRLF exactly like --file", async () => {
    const vault = vaultWithPrompts();
    readMock.mockResolvedValue("\uFEFFLine one\r\nLine two\r\n");

    const error = await run(vault, ["crlf", "--title", "CRLF", "--clipboard"]);

    expect(error).toBeUndefined();
    const stored = parsePrompt(readFileSync(storedPath(vault, "crlf")));
    expect(stored.body).toBe("Line one\nLine two\n");
  });

  it("rejects an empty clipboard as invalid data (exit 2) without creating a file", async () => {
    const vault = vaultWithPrompts();
    readMock.mockResolvedValue("");

    const error = await run(vault, ["empty", "--title", "E", "--clipboard"]);

    expect(error).toBeInstanceOf(InvalidPromptError);
    expect((error as InvalidPromptError).message).toContain(
      "empty prompt body",
    );
    expect((error as InvalidPromptError).exitCode).toBe(2);
    expect(existsSync(storedPath(vault, "empty"))).toBe(false);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(written(stdoutSpy)).toBe("");
    expect(written(stderrSpy)).toBe("");
  });

  it("rejects a whitespace-only clipboard as invalid data (exit 2)", async () => {
    const vault = vaultWithPrompts();
    readMock.mockResolvedValue(" \n\t  \n");

    const error = await run(vault, ["blank", "--title", "B", "--clipboard"]);

    expect(error).toBeInstanceOf(InvalidPromptError);
    expect((error as InvalidPromptError).exitCode).toBe(2);
    expect(existsSync(storedPath(vault, "blank"))).toBe(false);
    expect(written(stdoutSpy)).toBe("");
    expect(written(stderrSpy)).toBe("");
  });

  it("maps a clipboard read failure to a fixed IoError (exit 1) without the system message or content", async () => {
    const vault = vaultWithPrompts();
    readMock.mockRejectedValue(
      new Error(
        "Command failed with exit code 1: xsel\n\nSENSITIVE-MARKER-CLIPBOARD-CONTENT",
      ),
    );

    const error = await run(vault, ["fail", "--title", "F", "--clipboard"]);

    expect(error).toBeInstanceOf(IoError);
    expect((error as IoError).message).toBe(
      "clipboard unavailable: cannot read from the clipboard",
    );
    expect((error as IoError).message).not.toContain("SENSITIVE-MARKER");
    expect((error as IoError).exitCode).toBe(1);
    expect(existsSync(storedPath(vault, "fail"))).toBe(false);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(written(stdoutSpy)).toBe("");
    expect(written(stderrSpy)).not.toContain("SENSITIVE-MARKER");
  });

  it("rejects content above 1 MiB of UTF-8 bytes (exit 2)", async () => {
    const vault = vaultWithPrompts();
    readMock.mockResolvedValue("é".repeat(600_000)); // 1,200,000 bytes

    const error = await run(vault, ["big", "--title", "B", "--clipboard"]);

    expect(error).toBeInstanceOf(InvalidPromptError);
    expect((error as InvalidPromptError).message).toBe(
      "clipboard is too large: 1200000 bytes (limit 1048576)",
    );
    expect((error as InvalidPromptError).exitCode).toBe(2);
    expect(existsSync(storedPath(vault, "big"))).toBe(false);
  });

  it("rejects an invalid id before reading the clipboard", async () => {
    // Not initialized on purpose: the source and argument checks are pure,
    // so they must fail before any clipboard or vault I/O.
    const vault = temp("pv-add-clip-");

    const error = await run(vault, ["Bad", "--title", "T", "--clipboard"]);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).message).toContain("invalid id");
    expect(readMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid title before reading the clipboard", async () => {
    const vault = temp("pv-add-clip-");

    const error = await run(vault, ["ok-id", "--title", "   ", "--clipboard"]);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).message).toContain("invalid title");
    expect(readMock).not.toHaveBeenCalled();
  });

  it("rejects invalid tags before reading the clipboard", async () => {
    const vault = temp("pv-add-clip-");

    const error = await run(vault, [
      "ok-id",
      "--title",
      "T",
      "--clipboard",
      "--tags",
      "Bad Tag",
    ]);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).message).toContain("invalid tag");
    expect(readMock).not.toHaveBeenCalled();
  });

  it("reports a missing --title without touching the clipboard", async () => {
    const vault = temp("pv-add-clip-");

    const error = await run(vault, ["ok-id", "--clipboard"]);

    expect((error as Error).name).toBe("CommanderError");
    expect(readMock).not.toHaveBeenCalled();
  });

  it("requires exactly one body source, checked before any read", async () => {
    const vault = temp("pv-add-clip-");

    const missing = await run(vault, ["ok-id", "--title", "T"]);
    expect(missing).toBeInstanceOf(UsageError);
    expect((missing as UsageError).message).toBe(
      "missing body source: use --file <path> or --clipboard",
    );

    const conflicting = await run(vault, [
      "ok-id",
      "--title",
      "T",
      "--file",
      path.join(vault, "missing.md"),
      "--clipboard",
    ]);
    expect(conflicting).toBeInstanceOf(UsageError);
    expect((conflicting as UsageError).message).toBe(
      "conflicting body sources: use --file <path> or --clipboard, not both",
    );
    expect(readMock).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing prompt and never echoes the new body", async () => {
    const vault = vaultWithPrompts();
    const existing = serializePrompt({
      schemaVersion: 1,
      id: "dup",
      title: "Old title",
      tags: [],
      body: "old body\n",
    });
    writeFileSync(storedPath(vault, "dup"), existing);
    readMock.mockResolvedValue("SENSITIVE-NEW-BODY\n");

    const error = await run(vault, ["dup", "--title", "New", "--clipboard"]);

    expect(error).toBeInstanceOf(CreationConflictError);
    expect((error as CreationConflictError).exitCode).toBe(2);
    expect((error as CreationConflictError).message).toBe(
      "prompt already exists: dup",
    );
    expect((error as Error).message).not.toContain("SENSITIVE-NEW-BODY");
    expect(readFileSync(storedPath(vault, "dup"), "utf8")).toBe(existing);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(written(stdoutSpy)).toBe("");
    expect(written(stderrSpy)).not.toContain("SENSITIVE-NEW-BODY");
  });

  it("documents --clipboard in add --help without touching the clipboard", async () => {
    const error = await build()
      .parseAsync(["node", "promptvault", "add", "--help"])
      .catch((e: unknown) => e);

    expect((error as Error).name).toBe("CommanderError");
    expect(written(stdoutSpy)).toContain("--clipboard");
    expect(readMock).not.toHaveBeenCalled();
  });
});
