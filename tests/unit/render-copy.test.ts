import { mkdirSync, writeFileSync } from "node:fs";
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

const { writeMock } = vi.hoisted(() => ({
  writeMock: vi.fn<(text: string) => Promise<void>>(),
}));

vi.mock("clipboardy", () => ({
  default: { write: writeMock },
}));

import { registerRenderCommand } from "../../src/cli/render-command.js";
import { serializePrompt } from "../../src/core/prompt.js";
import { IoError, UsageError } from "../../src/shared/errors.js";
import { makeTempDir, removeTempDir } from "../helpers/run-cli.js";

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

function build(): Command {
  const program = new Command();
  program
    .name("promptvault")
    .option("--vault <path>")
    .exitOverride()
    .addHelpCommand(false);
  registerRenderCommand(program);
  return program;
}

function written(spy: MockInstance): string {
  return spy.mock.calls.map((call) => String(call[0])).join("");
}

let stdoutSpy: MockInstance;
let stderrSpy: MockInstance;

beforeEach(() => {
  writeMock.mockReset();
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

describe("render --copy", () => {
  it("copies before printing and confirms on stderr", async () => {
    const vault = temp("pv-render-copy-");
    seed(vault, "one", "{{x}}\n");
    writeMock.mockResolvedValue(undefined);

    await build().parseAsync([
      "node",
      "promptvault",
      "--vault",
      vault,
      "render",
      "one",
      "--var",
      "x=1",
      "--copy",
    ]);

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("1\n");
    expect(written(stdoutSpy)).toBe("1\n");
    expect(written(stderrSpy)).toBe("copied to clipboard\n");
  });

  it("does not touch the clipboard when rendering fails", async () => {
    const vault = temp("pv-render-copy-");
    seed(vault, "one", "{{x}}\n");

    const error = await build()
      .parseAsync([
        "node",
        "promptvault",
        "--vault",
        vault,
        "render",
        "one",
        "--copy",
      ])
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).message).toContain("missing variables: x");
    expect(writeMock).not.toHaveBeenCalled();
    expect(written(stdoutSpy)).toBe("");
    expect(written(stderrSpy)).toBe("");
  });

  it("keeps stdout empty and claims nothing when the clipboard fails", async () => {
    const vault = temp("pv-render-copy-");
    seed(vault, "one", "{{x}}\n");
    writeMock.mockRejectedValue(new Error("no clipboard here"));

    const error = await build()
      .parseAsync([
        "node",
        "promptvault",
        "--vault",
        vault,
        "render",
        "one",
        "--var",
        "x=1",
        "--copy",
      ])
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IoError);
    expect((error as IoError).message).toBe(
      "clipboard unavailable: no clipboard here",
    );
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(written(stdoutSpy)).toBe("");
    expect(written(stderrSpy)).toBe("");
  });

  it("does not touch the clipboard without --copy", async () => {
    const vault = temp("pv-render-copy-");
    seed(vault, "one", "{{x}}\n");

    await build().parseAsync([
      "node",
      "promptvault",
      "--vault",
      vault,
      "render",
      "one",
      "--var",
      "x=1",
    ]);

    expect(writeMock).not.toHaveBeenCalled();
    expect(written(stdoutSpy)).toBe("1\n");
    expect(written(stderrSpy)).toBe("");
  });
});
