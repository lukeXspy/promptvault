import type { Command } from "commander";
import { escapeText } from "../shared/escape.js";
import { initVault, resolveVault } from "../storage/vault.js";

/** Wires `promptvault init` (docs/CLI_SPEC.md § 5.1). */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("create the vault directory structure (idempotent)")
    .action(async () => {
      const vaultPath = resolveVault({
        cliPath: program.opts<{ vault?: string }>().vault,
        env: process.env,
        cwd: process.cwd(),
      });
      await initVault(vaultPath);
      process.stderr.write(
        `promptvault: vault initialized at ${escapeText(vaultPath)}\n`,
      );
    });
}
