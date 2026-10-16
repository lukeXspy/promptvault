import type { Command } from "commander";
import {
  isValidBody,
  normalizeTitle,
  parseTagList,
  requireValidId,
} from "../core/prompt-rules.js";
import { serializePrompt, type Prompt } from "../core/prompt.js";
import { decodeSource, encodeText } from "../core/text.js";
import { readFromClipboard } from "../shared/clipboard.js";
import { InvalidPromptError, UsageError } from "../shared/errors.js";
import { escapeText } from "../shared/escape.js";
import {
  readBodyFile,
  resolvePromptsDir,
  writePromptExclusive,
} from "../storage/prompts.js";
import { resolveVault } from "../storage/vault.js";

interface AddOptions {
  title: string;
  file?: string;
  clipboard?: boolean;
  tags?: string;
}

type BodySource = { kind: "file"; path: string } | { kind: "clipboard" };

/**
 * Exactly one body source is required (D63). This is a pure argument check,
 * so it runs before any read and before the vault's `prompts/` directory is
 * touched: missing or conflicting sources never read a file or the clipboard.
 */
function resolveBodySource(options: AddOptions): BodySource {
  const { file, clipboard } = options;
  if (file !== undefined && clipboard === true) {
    throw new UsageError(
      "conflicting body sources: use --file <path> or --clipboard, not both",
    );
  }
  if (file !== undefined) {
    return { kind: "file", path: file };
  }
  if (clipboard === true) {
    return { kind: "clipboard" };
  }
  throw new UsageError("missing body source: use --file <path> or --clipboard");
}

/** Wires `promptvault add` (docs/CLI_SPEC.md § 5.2). */
export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("add a prompt from a body file or the clipboard")
    .argument("<id>", "prompt id (slug, at most 80 characters)")
    .requiredOption("--title <title>", "prompt title")
    .option("--file <path>", "file whose content is the prompt body")
    .option("--clipboard", "use the current clipboard text as the prompt body")
    .option("--tags <csv>", "comma-separated tags")
    .action(async (id: string, options: AddOptions) => {
      const vaultPath = resolveVault({
        cliPath: program.opts<{ vault?: string }>().vault,
        env: process.env,
        cwd: process.cwd(),
      });
      const validId = requireValidId(id);
      const title = normalizeTitle(options.title);
      const tags = parseTagList(options.tags);
      const source = resolveBodySource(options);
      const promptsDir = await resolvePromptsDir(vaultPath);
      const raw =
        source.kind === "clipboard"
          ? encodeText(await readFromClipboard())
          : await readBodyFile(source.path);
      const body = decodeSource(
        raw,
        source.kind === "clipboard" ? "clipboard" : "body file",
      );
      if (!isValidBody(body)) {
        throw new InvalidPromptError(
          "empty prompt body: at least one non-whitespace character is required",
        );
      }
      const prompt: Prompt = {
        schemaVersion: 1,
        id: validId,
        title,
        tags,
        body,
      };
      await writePromptExclusive(promptsDir, validId, serializePrompt(prompt));
      process.stderr.write(
        `promptvault: added prompt "${escapeText(validId)}"\n`,
      );
    });
}
