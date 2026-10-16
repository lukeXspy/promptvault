import type { Command } from "commander";
import { EXIT, UsageError } from "../shared/errors.js";
import {
  formatDoctorReport,
  type DoctorFileReport,
  type DoctorReport,
} from "../shared/output.js";
import { scanPromptsDir } from "../storage/prompts.js";
import { resolveVault } from "../storage/vault.js";

/**
 * Builds the doctor report from the shared read-only scan (D50). A missing
 * `prompts/` directory (uninitialized vault) becomes a report problem
 * (exit 2); every other vault-level failure stays an IoError (exit 1).
 */
async function buildReport(vaultPath: string): Promise<DoctorReport> {
  try {
    const entries = await scanPromptsDir(vaultPath);
    const files: DoctorFileReport[] = entries.map((entry) =>
      entry.kind === "ok"
        ? { name: entry.name }
        : { name: entry.name, problem: entry.reason },
    );
    return { vaultPath, files };
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    return { vaultPath, files: null };
  }
}

/** Wires `promptvault doctor` (docs/CLI_SPEC.md § 5.7). */
export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("scan the vault read-only and report problems")
    .action(async () => {
      const vaultPath = resolveVault({
        cliPath: program.opts<{ vault?: string }>().vault,
        env: process.env,
        cwd: process.cwd(),
      });
      const report = await buildReport(vaultPath);
      process.stdout.write(formatDoctorReport(report));
      const clean =
        report.files !== null &&
        report.files.every((file) => file.problem === undefined);
      process.exitCode = clean ? EXIT.OK : EXIT.USAGE;
    });
}
