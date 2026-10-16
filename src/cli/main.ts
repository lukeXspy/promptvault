#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { EXIT, PromptVaultError } from "../shared/errors.js";
import { VERSION } from "../version.js";
import { registerAddCommand } from "./add-command.js";
import { registerDoctorCommand } from "./doctor-command.js";
import { registerInitCommand } from "./init-command.js";
import { registerListCommand } from "./list-command.js";
import { registerRenderCommand } from "./render-command.js";
import { registerSearchCommand } from "./search-command.js";
import { registerShowCommand } from "./show-command.js";

const program = new Command();

program
  .name("promptvault")
  .description(
    "Local Markdown prompt library: search, variables, clipboard copy.",
  )
  .version(VERSION, "--version", "print the version")
  .option(
    "--vault <path>",
    "vault root directory (default: $PROMPTVAULT_HOME or ~/.promptvault)",
  )
  .showHelpAfterError('(run "promptvault --help" for usage)')
  .configureOutput({
    writeOut: (text) => process.stdout.write(text),
    // Commander's parse errors start with "error:"; align with CLI_SPEC § 1.
    writeErr: (text) => {
      process.stderr.write(
        text.startsWith("error:") ? `promptvault: ${text}` : text,
      );
    },
  })
  .exitOverride()
  // Keep the command surface exactly as documented in CLI_SPEC: no implicit
  // `help` subcommand (the `--help` flag fully covers help).
  .addHelpCommand(false);

registerAddCommand(program);
registerDoctorCommand(program);
registerInitCommand(program);
registerListCommand(program);
registerRenderCommand(program);
registerSearchCommand(program);
registerShowCommand(program);

/** Maps a thrown error to a stderr message and the process exit code. */
function reportError(error: unknown): void {
  if (error instanceof CommanderError) {
    // Commander already wrote its output (help, version, or parse error).
    // Help and version exit 0; every parse problem is a usage error (exit 2).
    process.exitCode = error.exitCode === 0 ? EXIT.OK : EXIT.USAGE;
    return;
  }
  if (error instanceof PromptVaultError) {
    process.stderr.write(`promptvault: error: ${error.message}\n`);
    process.exitCode = error.exitCode;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`promptvault: error: ${message}\n`);
  process.exitCode = EXIT.FAILURE;
}

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    reportError(error);
  }
}

await main();
