import type { Command } from "commander";
import {
  isValidBody,
  normalizeTitle,
  parseTagList,
  requireValidId,
} from "../core/prompt-rules.js";
import { serializePrompt, type Prompt } from "../core/prompt.js";
import { decodeSource } from "../core/text.js";
import { InvalidPromptError } from "../shared/errors.js";
import { escapeText } from "../shared/escape.js";
import {
  readBodyFile,
  resolvePromptsDir,
  writePromptExclusive,
} from "../storage/prompts.js";
import { resolveVault } from "../storage/vault.js";

interface AddOptions {
  title: string;
  file: string;
  tags?: string;
}

/** Wires `promptvault add` (docs/CLI_SPEC.md § 5.2). */
export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("add a prompt from a body file")
    .argument("<id>", "prompt id (slug, at most 80 characters)")
    .requiredOption("--title <title>", "prompt title")
    .requiredOption("--file <path>", "file whose content is the prompt body")
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
      const promptsDir = await resolvePromptsDir(vaultPath);
      const body = decodeSource(await readBodyFile(options.file), "body file");
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
