import { InvalidPromptError } from "../shared/errors.js";
import { MAX_PROMPT_BYTES } from "./prompt-rules.js";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

/**
 * Decodes raw file bytes into canonical text (ARCHITECTURE § 3): 1 MiB size
 * limit, UTF-8 validation, BOM strip and CRLF → LF. `label` names the source
 * in error messages (for example "prompt file" or "body file").
 */
export function decodeSource(source: Uint8Array, label: string): string {
  if (source.byteLength > MAX_PROMPT_BYTES) {
    throw new InvalidPromptError(
      `${label} is too large: ${source.byteLength} bytes (limit ${MAX_PROMPT_BYTES})`,
    );
  }
  let text: string;
  try {
    text = utf8Decoder.decode(source);
  } catch {
    throw new InvalidPromptError(`${label} is not valid UTF-8`);
  }
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

/**
 * Encodes text into UTF-8 bytes so it can pass through `decodeSource`'s
 * size/UTF-8/BOM/CRLF rules (ARCHITECTURE § 3). Used for text that does not
 * arrive as file bytes (for example clipboard text).
 */
export function encodeText(text: string): Uint8Array {
  return utf8Encoder.encode(text);
}
