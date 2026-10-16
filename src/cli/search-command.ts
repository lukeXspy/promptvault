import type { Command } from "commander";
import { requireValidTag } from "../core/prompt-rules.js";
import { promptMatches, requireNonEmptyQuery } from "../core/search.js";
import { formatPromptRows } from "../shared/output.js";
import { loadAllPrompts } from "../storage/prompts.js";
import { resolveVault } from "../storage/vault.js";

interface SearchOptions {
  tag?: string;
  json?: boolean;
}

/** Wires `promptvault search` (docs/CLI_SPEC.md § 5.5). */
export function registerSearchCommand(program: Command): void {
  program
    .command("search")
    .description("search prompts by literal substring")
    .argument("<query>", "literal, case-insensitive substring")
    .option("--tag <tag>", "filter by tag (exact match)")
    .option("--json", "print JSON")
    .action(async (query: string, options: SearchOptions) => {
      const vaultPath = resolveVault({
        cliPath: program.opts<{ vault?: string }>().vault,
        env: process.env,
        cwd: process.cwd(),
      });
      requireNonEmptyQuery(query);
      const tag =
        options.tag === undefined ? undefined : requireValidTag(options.tag);
      const prompts = await loadAllPrompts(vaultPath);
      const rows = prompts.filter(
        (prompt) =>
          promptMatches(prompt, query) &&
          (tag === undefined || prompt.tags.includes(tag)),
      );
      process.stdout.write(formatPromptRows(rows, options.json === true));
    });
}
