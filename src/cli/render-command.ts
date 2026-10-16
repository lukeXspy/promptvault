import type { Command } from "commander";
import { renderBody } from "../core/variables.js";
import { copyToClipboard } from "../shared/clipboard.js";
import { loadPrompt } from "../storage/prompts.js";
import { resolveVault } from "../storage/vault.js";

interface RenderOptions {
  var: string[];
  copy?: boolean;
}

function collectVar(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Wires `promptvault render` (docs/CLI_SPEC.md § 5.6). */
export function registerRenderCommand(program: Command): void {
  program
    .command("render")
    .description("render a prompt with variable values")
    .argument("<id>", "prompt id")
    .option("--var <key=value>", "variable value (repeatable)", collectVar, [])
    .option("--copy", "copy the rendered prompt to the clipboard")
    .action(async (id: string, options: RenderOptions) => {
      const vaultPath = resolveVault({
        cliPath: program.opts<{ vault?: string }>().vault,
        env: process.env,
        cwd: process.cwd(),
      });
      const prompt = await loadPrompt(vaultPath, id);
      const rendered = renderBody(prompt.body, options.var);
      if (options.copy !== true) {
        process.stdout.write(rendered);
        return;
      }
      // D11: nothing is copied or printed when rendering failed, and a failed
      // copy must not claim success nor print content.
      await copyToClipboard(rendered);
      process.stdout.write(rendered);
      process.stderr.write("copied to clipboard\n");
    });
}
