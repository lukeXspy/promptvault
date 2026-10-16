# PromptVault — Roadmap

Small, verifiable stages. Do not start a stage before the previous one passes
its gates, and do not implement beyond the current request (AGENTS.md § 3).

Quality gates for every stage after Stage 1: `npm run format:check`,
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Stage 0 — Documentation baseline (done)

- [x] `AGENTS.md` — persistent agent rules, stack, quality gates, limits.
- [x] `docs/PRD.md` — problem, audience, scope, non-goals, acceptance criteria.
- [x] `docs/ARCHITECTURE.md` — modules, file format, data flow, escaping.
- [x] `docs/CLI_SPEC.md` — command contracts, outputs, exit codes.
- [x] `docs/ROADMAP.md` — this file.
- [x] `docs/DECISIONS.md` — decisions and open questions.
- No source code, no package.json, no empty folders created (by design).

## Stage 1 — Repository bootstrap and CLI skeleton (done)

- [x] `package.json`: ESM (`"type": "module"`), `engines.node >= 24`,
  `bin: promptvault`, scripts: `dev`, `build`, `typecheck`, `lint`,
  `format`, `format:check`, `test`.
- [x] Verify real versions before installing (`npm view <pkg> version` for
  commander, yaml, zod, clipboardy, typescript, tsx, vitest, eslint,
  prettier, @types/node). Never invent versions.
- [x] `tsconfig.json`: strict, NodeNext modules, `outDir dist`, no `any`
  escapes.
- [x] ESLint (flat config) + Prettier with minimal rules.
- [x] Vitest configured; one smoke test.
- [x] `.gitignore` (node_modules, dist, coverage).
- [x] Minimal CLI skeleton in `src/cli/`: `--help`, `--version`, global
  `--vault` option parsed, exit-code mapping scaffold; no commands yet.
- [x] Verify: `npm run build` produces runnable `dist/cli/main.js`;
  `node dist/cli/main.js --help` and `--version` work; smoke test passes.
- [x] Record anything discovered about Commander's handling of global options
  around subcommands (feeds DECISIONS Q6).
  - Stage 1 defines no subcommands; Commander findings recorded in DECISIONS
    D33. Position of global options around subcommands to pin in Stage 2 (Q6).

Installed versions (resolved from the registry during this stage):
commander 15.0.0; typescript 6.0.3; tsx 4.23.15; vitest 5.0.5; eslint
10.12.0; prettier 3.9.10; typescript-eslint 8.71.2; @types/node 24.19.2.
`yaml`, `zod` and `clipboardy` were verified (2.9.1 / 4.6.7 / 5.3.2) but are
installed only in their stages (3 and 9).

## Stage 2 — Vault resolution + `init` (done)

- [x] `resolveVault`: `--vault` → `PROMPTVAULT_HOME` → `~/.promptvault`;
  relative paths from cwd; empty env treated as unset; no `~` expansion.
- [x] `initVault`: create `<vault>/prompts/` recursively; idempotent; no
  examples; no `config.json`.
- [x] Symlink/realpath guard for `prompts/` (see ARCHITECTURE § 6; the
  `realpath` half moves to the target-path stages — D36).
- [x] `promptvault init` wired with correct exit codes (0 idempotent,
  1 on I/O failure).
- [x] Tests: resolution precedence, relative paths, idempotency, path blocked
  by a file, symlinked `prompts/` rejected, no stray files created.

Notes: Commander 15 accepts `--vault` on both sides of the subcommand (D18
updated; Q6 resolved). A blank `--vault` is exit 2 (D34); Commander's implicit
`help` subcommand is disabled (D35). Integration tests spawn the CLI with a
throwaway `PROMPTVAULT_HOME` and work against temp vaults only (D25).

## Stage 3 — Prompt format: parse, validate, serialize (done)

- [x] `core`: id/title/tags rules; Zod schema (strict, `schemaVersion` = 1);
  `parsePrompt` (delimiter-line scan, BOM strip, CRLF → LF, size and UTF-8
  checks); `serializePrompt`.
- [x] Typed errors with reasons (missing front matter, unterminated, YAML
  syntax, duplicate keys, unknown property, schema mismatch, empty body,
  too large, invalid UTF-8).
- [x] Tests: valid file; body containing `---` lines; body starting with
  `---`; BOM; CRLF; missing/extra properties; wrong types; aliases, multiple
  documents and custom tags rejected; size limit (1 MiB boundary); empty/
  whitespace-only body; round-trip parse → serialize → parse.

Notes: `yaml` 2.9.1 and `zod` 4.6.7 installed (pre-approved stack, ARCHITECTURE
§ 10); versions re-verified with `npm view` before install. `parsePrompt` takes
raw bytes (`Uint8Array`), so the 1 MiB size and UTF-8 checks run before
decoding. YAML behavior was pinned with throwaway probes before the tests
(D39): the `json` schema option refuses plain scalars, duplicate keys are
document errors, and custom tags are only warnings — hence the explicit AST
walk rejecting tags, anchors and aliases. `parsePrompt`/`serializePrompt` are
pure content functions; the filename-vs-id rule belongs to the loading stage
(D40). Serialization is byte-identical to the ARCHITECTURE § 3 example and
round-trips exactly (re-serializing after a round-trip is byte-identical).
Suite after this stage: 8 test files, 66 tests.

## Stage 4 — `add` (done)

- [x] Validate id/title/tags; body from `--file` (same read rules as Stage 3).
- [x] `--tags` CSV: trim, validate, dedupe, ordinal sort, max 20, reject
  empty items.
- [x] Exclusive create with `open(path, 'wx')`; `EEXIST` → exit 2.
- [x] Vault must be initialized; otherwise exit 2 with init hint.
- [x] Success message on stderr; stdout empty.
- [x] Tests: happy path, conflict, invalid tags, invalid id/title, oversized
  body, CRLF input normalized to LF, no overwrite, never writes outside
  `prompts/`.

Notes: input validation lives in `core` (`requireValidId`, `normalizeTitle`,
`parseTagList`, `isValidBody`), and the byte-level read rules were extracted
from `parsePrompt` into `core/text.ts` (`decodeSource`, label-aware) so `add`
reuses them for `--file`. Failure mapping and the validation order are pinned
in D41/D42; the title is trimmed before validation and stored trimmed (D38
follow-through). The `realpath` half of the §6 guard runs for `add` via
`resolvePromptsDir` (`realpath` after `lstat`). Suite after this stage: 10 test
files, 100 tests.

## Stage 5 — `list` (done)

- [x] `loadAllPrompts`: readdir + lstat each entry; symlink/subdir/stray file
  → error; validate all before output (no partial results).
- [x] Ordinal sort by id; human lines `<id>TAB<title>`; `--json` pure JSON.
- [x] `--tag` filter (slug-validated, exit 2 if malformed); empty result → no
  output / `[]`, exit 0.
- [x] Tests: ordering, tag filter, empty vault, invalid file fails whole
  command, JSON purity and shape, escaping of control characters in titles.

Notes: loading lives in `src/storage/prompts.ts` (`loadAllPrompts`); findings
for symlinks, non-regular entries, non-`.md` names, parse/schema failures and
name-vs-id mismatches are collected and thrown as one error joined with `; `
(D43). Ordering uses `compareOrdinal` (`src/core/order.ts`); output formatting
lives in `src/shared/output.ts` (`formatPromptRows`, reused by `search`), with
the JSON escaping pinned in D44. The `--tag` single-value check reuses
`requireValidTag` from `core`. Suite after this stage: 13 test files, 124
tests.

## Stage 6 — `show` (done)

- [x] Load single prompt; print body exactly as stored, nothing else on
  stdout.
- [x] Not found or malformed id → exit 3; invalid addressed file → exit 2.
- [x] Tests: byte-exact body output (no added trailing newline), error paths,
  stdout/stderr separation.

Notes: `loadPrompt` (`src/storage/prompts.ts`) validates the id before any
path is built (malformed ids never touch the filesystem), maps a missing
`<id>.md` to `PromptNotFoundError` (exit 3) and an existing but invalid entry
to `InvalidPromptError` (exit 2) with the D43 finding wording (D46). Bodies
stream raw, exempt from §8 escaping (D45). Suite after this stage: 15 test
files, 141 tests.

## Stage 7 — `search` (done)

- [x] Case-insensitive substring across id, title, each tag, body; `--tag`
  filter; same validation/ordering/output as `list`.
- [x] Tests: hit per field, case-insensitivity, multi-word query as single
  substring, no results exit 0, invalid vault fails whole command.

Notes: `promptMatches`/`requireNonEmptyQuery` in `src/core/search.ts` (D47);
the command reuses `loadAllPrompts` (D43) and `formatPromptRows` (D44), so
`search` and `list` share validation, ordering, escaping and output shapes.
Only the empty query is rejected (exit 2); whitespace is a literal substring.
Suite after this stage: 17 test files, 157 tests.

## Stage 8 — `render` (variables, no clipboard) (done)

- [x] Token extraction (`{{name}}` with optional spaces, grammar as in
  ARCHITECTURE § 7); single-pass literal global substitution.
- [x] `--var` parsing (split on first `=`), duplicate/missing/unused errors,
  exit 2, nothing on stdout; values never echoed in messages.
- [x] Tests: substitution correctness, value containing `=`, empty value,
  inserted values never re-scanned, malformed tokens are literal text,
  nested braces behavior, all error cases.

Notes: `src/core/variables.ts` (D48) shares one scanner between extraction
and substitution; missing names are listed in appearance order and unused
names in provision order; malformed pairs and bad keys got their own catalog
entries. `render` reads only the addressed file (like `show`, D46). Suite
after this stage: 19 test files, 184 tests.

## Stage 9 — `render --copy` (done)

- [x] Add `clipboardy` (only now, per approved stack).
- [x] Render and validate in memory → copy → only then print body and stderr
  confirmation; clipboard failure → exit 1, stderr error, empty stdout.
- [x] Tests: copy invoked only after successful render (spy), failure path
  keeps stdout empty, success path prints body.

Notes: wrapper in `src/shared/clipboard.ts` (D49); the confirmation is
`copied to clipboard`; the OS clipboard is mocked in the in-process command
tests and integration tests never pass `--copy`. Suite after this stage:
21 test files, 192 tests.

## Stage 10 — `doctor` (done)

- [x] Full read-only scan: uninitialized vault, each file's parse/validate
  result, symlinks, stray entries; report on stdout; exit 0/2/1 per contract.
- [x] Tests: clean vault, one broken file, symlink entry, uninitialized
  vault, report never mutates the vault (mtime/size checks).

Notes: the `list`/`search` loader was refactored onto a shared
`scanPromptsDir` (D50) so validation can never diverge between commands;
`loadAllPrompts` keeps the D43 aggregate message exactly. Uninitialized vault
= report problem (exit 2); other read failures stay IoError (exit 1). Suite
after this stage: 22 test files, 205 tests.

## Stage 11 — Polish and release readiness (in progress)

- [x] Documentation for users and contributors: `README.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, issue/PR templates.
- [ ] `examples/` with one or two sample prompts (no personal data).
  Deliberately not created in the audit pass (it was not part of that
  request); still open.
- [x] LICENSE decision (DECISIONS Q1/D51/D57/D58): MIT finalized with the
  confirmed holder and year — `LICENSE` added (`Copyright (c) 2026 Lucas
  Enzo Marcon`) and `license: "MIT"` in `package.json` and the lockfile.
- [x] `npm pack --dry-run` review (do NOT publish) and local-tarball install
  test (`npm run smoke:pack`; D52).
- [x] Walkthrough in CLI_SPEC § 7 exercised against the installed tarball on
  Windows — every step except `render --copy` (real clipboard), see
  `scripts/smoke-pack.mjs`. Linux/macOS: covered by the CI matrix (Q3/D61).
- [x] Docs synced; DECISIONS open questions updated (Q1 resolved in the
  closure review; Q2 and Q11 tracked; Q3 resolved on 2026-10-16).
- [ ] Release (tag/publish) only on explicit user request.

Notes: executed as an audit-first pass (no new features). All five gates were
green before and after; the contract/security audit found no product defects.
Two test-infrastructure defects were fixed: load-dependent 5s timeouts (D55)
and a per-worker temp-directory leak in the `runCli` tripwire (D56; 148
residue entries removed, zero new per run). Three untested contract behaviors
were pinned by regression tests (excess arguments on `list` and `show` exit
2; `add` leaves its `--file` source byte-identical). The CI workflow
(Windows/Linux/macOS, Node.js 24, five gates) first ran on the hosted
repository (2026-10-16): Ubuntu and macOS green; the Windows job failed on a
test-only realpath assumption, fixed in D61. The follow-up run is green on
all three jobs (Ubuntu, macOS, Windows):
https://github.com/lukeXspy/promptvault/actions/runs/38943882635

Closure review (same stage): the `license` field was briefly reverted to
`UNLICENSED` to avoid a declared-but-undeliverable state (D57), then
finalized when the maintainer confirmed holder and year — MIT with `LICENSE`
added (D58). SECURITY.md now asks for a private contact via issue without
any details and records GitHub Private Vulnerability Reporting as a future
action, not enabled (Q11). All five gates and the packaging smoke were re-run
green after each change (smoke: 21 checks; installed manifest confirms
`license=MIT private=true`). Suite: 22 test files, 208 tests, green in seven
consecutive full runs.

## Stage 12+ — Post-MVP candidates (only if requested)

- [ ] Ignore dotfiles in `prompts/` (revisit D7) if real users hit it.
- [ ] `doctor --json`.
- [ ] Optional coverage thresholds (see DECISIONS Q4); the first CI matrix
  run (Stage 11, Q3) completed green on 2026-10-16.

Do not start any Stage 12 item without an explicit request; candidate list is
for future discussion only.
