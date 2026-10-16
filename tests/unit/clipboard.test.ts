import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeMock } = vi.hoisted(() => ({
  writeMock: vi.fn<(text: string) => Promise<void>>(),
}));

vi.mock("clipboardy", () => ({
  default: { write: writeMock },
}));

import { copyToClipboard } from "../../src/shared/clipboard.js";
import { IoError } from "../../src/shared/errors.js";

beforeEach(() => {
  writeMock.mockReset();
});

describe("copyToClipboard", () => {
  it("writes the exact text once", async () => {
    writeMock.mockResolvedValue(undefined);

    await copyToClipboard("line one\nline two\n");

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("line one\nline two\n");
  });

  it("maps failures to an IoError (exit 1) without the copied content", async () => {
    writeMock.mockRejectedValue(new Error("xsel is not installed"));

    const error = await copyToClipboard("SECRET").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IoError);
    expect((error as IoError).message).toBe(
      "clipboard unavailable: xsel is not installed",
    );
    expect((error as IoError).message).not.toContain("SECRET");
    expect((error as IoError).exitCode).toBe(1);
  });

  it("collapses the system message to one line and escapes controls", async () => {
    writeMock.mockRejectedValue(
      new Error("cannot copy\n\tto clipboard \u0007"),
    );

    const error = await copyToClipboard("x").catch((e: unknown) => e);

    expect((error as IoError).message).toBe(
      "clipboard unavailable: cannot copy to clipboard \\u0007",
    );
  });

  it("handles non-Error rejections and empty messages", async () => {
    writeMock.mockRejectedValueOnce("boom");
    const fromString = await copyToClipboard("x").catch((e: unknown) => e);
    expect((fromString as IoError).message).toBe("clipboard unavailable: boom");

    writeMock.mockRejectedValueOnce(new Error(""));
    const fromEmpty = await copyToClipboard("x").catch((e: unknown) => e);
    expect((fromEmpty as IoError).message).toBe(
      "clipboard unavailable: unknown error",
    );
  });
});
