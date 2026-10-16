import { escapeText } from "./escape.js";

/** Minimal prompt shape needed to format list/search result rows. */
export interface PromptRow {
  id: string;
  title: string;
  tags: string[];
}

/**
 * Formats list/search rows (D16, ARCHITECTURE § 9): human lines
 * `<id>\t<title>`, or pretty JSON with the fixed key order `id`, `title`,
 * `tags`; both with a trailing newline. Empty results produce no bytes
 * (human) or `[]\n` (JSON). Every string passes through `escapeText` first,
 * so the same control-character policy applies to both outputs (D15, D44).
 */
export function formatPromptRows(rows: PromptRow[], json: boolean): string {
  const escaped = rows.map((row) => ({
    id: escapeText(row.id),
    title: escapeText(row.title),
    tags: row.tags.map((tag) => escapeText(tag)),
  }));
  if (json) {
    return `${JSON.stringify(escaped, null, 2)}\n`;
  }
  return escaped.map((row) => `${row.id}\t${row.title}\n`).join("");
}

/** One scanned entry of the doctor report (CLI_SPEC § 5.7). */
export interface DoctorFileReport {
  name: string;
  /** Human-readable problem; undefined when the entry is fine. */
  problem?: string;
}

/**
 * Input for `formatDoctorReport`; `files` is null when the vault is not
 * initialized (reported as a single problem).
 */
export interface DoctorReport {
  vaultPath: string;
  files: DoctorFileReport[] | null;
}

/**
 * Formats the `doctor` report (D19, D50): a `vault:` header, `prompts:`
 * count, one line per entry in scan order (`OK     <name>` /
 * `ERROR  <name>: <problem>`, labels padded to 7 columns), a summary with
 * invariant wording and a trailing newline. Every string passes through
 * `escapeText` first (D15); bodies are never printed.
 */
export function formatDoctorReport(report: DoctorReport): string {
  const lines = [`vault: ${escapeText(report.vaultPath)}`];
  let ok = 0;
  let bad = 0;
  if (report.files === null) {
    bad = 1;
    lines.push('ERROR  vault not initialized; run "promptvault init"');
  } else {
    lines.push(`prompts: ${report.files.length} file(s)`);
    for (const file of report.files) {
      if (file.problem === undefined) {
        ok += 1;
        lines.push(`OK     ${escapeText(file.name)}`);
      } else {
        bad += 1;
        lines.push(
          `ERROR  ${escapeText(file.name)}: ${escapeText(file.problem)}`,
        );
      }
    }
  }
  lines.push(`summary: ${ok} ok, ${bad} error`);
  return `${lines.join("\n")}\n`;
}
