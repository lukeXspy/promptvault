import type { Command } from "commander";
import { loadPrompt } from "../storage/prompts.js";
import { resolveVault } from "../storage/vault.js";

/** Wires `promptvault show` (docs/CLI_SPEC.md § 5.4). */
export function registerShowCommand(program: Command): void {
  program
    .command("show")
    .description("print a prompt's body")
    .argument("<id>", "prompt id")
    .action(async (id: string) => {
      const vaultPath = resolveVault({
        cliPath: program.opts<{ vault?: string }>().vault,
        env: process.env,
        cwd: process.cwd(),
      });
      const prompt = await loadPrompt(vaultPath, id);
      process.stdout.write(prompt.body);
    });
}
