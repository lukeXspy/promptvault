import clipboard from "clipboardy";
import { IoError } from "./errors.js";
import { escapeText } from "./escape.js";

/**
 * Copies `text` to the system clipboard (D11). Success is silent here; any
 * platform failure becomes an IoError (exit 1). The diagnostic carries only
 * the system message — never the copied content — collapsed to a single
 * line and control-escaped (ARCHITECTURE § 8).
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await clipboard.write(text);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const system =
      escapeText(raw).replace(/\s+/g, " ").trim() || "unknown error";
    throw new IoError(`clipboard unavailable: ${system}`);
  }
}
