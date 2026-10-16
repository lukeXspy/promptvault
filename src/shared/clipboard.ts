import { IoError } from "./errors.js";

/*
 * Clipboard failures map to a fixed, generic message per operation (D64).
 * The error thrown by `clipboardy`, its platform tools or `execa` is never
 * forwarded: `execa` embeds captured stdout/stderr in `error.message`, and
 * for a read the captured stdout is the clipboard content itself. Collapsing
 * whitespace and escaping control characters does not remove that data.
 */
const READ_FAILURE = "clipboard unavailable: cannot read from the clipboard";
const WRITE_FAILURE = "clipboard unavailable: cannot write to the clipboard";

/**
 * Copies `text` to the system clipboard (D11, D49). Success is silent here;
 * any platform failure becomes a fixed-message IoError (exit 1) that never
 * repeats the system error or the copied text (D64).
 *
 * `clipboardy` is imported on demand (D63): commands that never run a
 * clipboard operation never load it.
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    const { default: clipboard } = await import("clipboardy");
    await clipboard.write(text);
  } catch {
    throw new IoError(WRITE_FAILURE);
  }
}

/**
 * Reads the current clipboard text for `add --clipboard` (D63). A platform
 * failure becomes a fixed-message IoError (exit 1) that never repeats the
 * system error or any read bytes (D64). Empty or whitespace-only content is
 * returned as-is: the caller treats it as invalid prompt data (exit 2). The
 * clipboard is never modified.
 */
export async function readFromClipboard(): Promise<string> {
  try {
    const { default: clipboard } = await import("clipboardy");
    return await clipboard.read();
  } catch {
    throw new IoError(READ_FAILURE);
  }
}
