import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMock, writeMock, clipboardyState } = vi.hoisted(() => ({
  readMock: vi.fn<() => Promise<string>>(),
  writeMock: vi.fn<(text: string) => Promise<void>>(),
  clipboardyState: { loaded: false },
}));

vi.mock("clipboardy", () => {
  clipboardyState.loaded = true;
  return { default: { read: readMock, write: writeMock } };
});

import {
  copyToClipboard,
  readFromClipboard,
} from "../../src/shared/clipboard.js";
import { IoError } from "../../src/shared/errors.js";

beforeEach(() => {
  readMock.mockReset();
  writeMock.mockReset();
});

describe("clipboard adapter", () => {
  // First test in this file by design: no clipboard operation has run yet,
  // so the dependency must not have been loaded.
  it("loads clipboardy on demand, only when a clipboard operation runs", async () => {
    expect(clipboardyState.loaded).toBe(false);

    readMock.mockResolvedValue("text");
    await readFromClipboard();

    expect(clipboardyState.loaded).toBe(true);
  });

  describe("copyToClipboard", () => {
    it("writes the exact text once", async () => {
      writeMock.mockResolvedValue(undefined);

      await copyToClipboard("line one\nline two\n");

      expect(writeMock).toHaveBeenCalledTimes(1);
      expect(writeMock).toHaveBeenCalledWith("line one\nline two\n");
    });

    it("maps failures to a fixed IoError (exit 1) without the system message or content", async () => {
      writeMock.mockRejectedValue(
        new Error("failed to copy: SENSITIVE-MARKER-RENDERED-BODY"),
      );

      const error = await copyToClipboard("SENSITIVE-BODY").catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(IoError);
      expect((error as IoError).message).toBe(
        "clipboard unavailable: cannot write to the clipboard",
      );
      expect((error as IoError).message).not.toContain("SENSITIVE");
      expect((error as IoError).exitCode).toBe(1);
    });

    it("maps arbitrary failure shapes to the same fixed message", async () => {
      writeMock.mockRejectedValueOnce("boom");
      const fromString = await copyToClipboard("x").catch((e: unknown) => e);
      expect((fromString as IoError).message).toBe(
        "clipboard unavailable: cannot write to the clipboard",
      );

      writeMock.mockRejectedValueOnce(
        new Error("cannot copy\n\tSECRET \u0007"),
      );
      const fromControls = await copyToClipboard("x").catch((e: unknown) => e);
      expect((fromControls as IoError).message).toBe(
        "clipboard unavailable: cannot write to the clipboard",
      );
    });
  });

  describe("readFromClipboard", () => {
    it("returns the exact clipboard text once", async () => {
      readMock.mockResolvedValue("line one\nline two\n");

      await expect(readFromClipboard()).resolves.toBe("line one\nline two\n");
      expect(readMock).toHaveBeenCalledTimes(1);
    });

    it("maps failures to a fixed IoError (exit 1) without the system message or content", async () => {
      readMock.mockRejectedValue(
        new Error(
          "Command failed with exit code 1: pbpaste\n\nSENSITIVE-MARKER-CLIPBOARD-CONTENT",
        ),
      );

      const error = await readFromClipboard().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(IoError);
      expect((error as IoError).message).toBe(
        "clipboard unavailable: cannot read from the clipboard",
      );
      expect((error as IoError).message).not.toContain("SENSITIVE");
      expect((error as IoError).message).not.toContain("Command failed");
      expect((error as IoError).exitCode).toBe(1);
    });

    it("maps arbitrary failure shapes to the same fixed message", async () => {
      readMock.mockRejectedValueOnce("boom");
      const fromString = await readFromClipboard().catch((e: unknown) => e);
      expect((fromString as IoError).message).toBe(
        "clipboard unavailable: cannot read from the clipboard",
      );

      readMock.mockRejectedValueOnce(new Error(""));
      const fromEmpty = await readFromClipboard().catch((e: unknown) => e);
      expect((fromEmpty as IoError).message).toBe(
        "clipboard unavailable: cannot read from the clipboard",
      );
    });
  });
});
