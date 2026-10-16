import type { Command } from "commander";
import { requireValidTag } from "../core/prompt-rules.js";
import { formatPromptRows } from "../shared/output.js";
import { loadAllPrompts } from "../storage/prompts.js";
import { resolveVault } from "../storage/vault.js";

interface ListOptions {
  tag?: string;
  json?: boolean;
}

/** Wires `promptvault list` (docs/CLI_SPEC.md § 5.3). */
export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("list prompts as id and title")
    .option("--tag <tag>", "filter by tag (exact match)")
    .option("--json", "print JSON")
    .action(async (options: ListOptions) => {
      const vaultPath = resolveVault({
        cliPath: program.opts<{ vault?: string }>().vault,
        env: process.env,
        cwd: process.cwd(),
      });
      const tag =
        options.tag === undefined ? undefined : requireValidTag(options.tag);
      const prompts = await loadAllPrompts(vaultPath);
      const filtered =
        tag === undefined
          ? prompts
          : prompts.filter((prompt) => prompt.tags.includes(tag));
      process.stdout.write(formatPromptRows(filtered, options.json === true));
    });
}
