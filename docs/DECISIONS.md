# PromptVault — Decisions and Open Questions

Lightweight decision log. Each entry: Context → Decision → Rationale.
Open questions are tracked at the end; resolve them in the stage that needs
them and move the entry up.

## Resolved in the documentation baseline (Stage 0)

### D1 — No `config.json` in the MVP

Context: the spec mentions not creating a config while unnecessary.
Decision: the MVP creates and reads only `<vault>/prompts/`. No config file.
Rationale: fewer contracts to keep compatible; add config only when a real
setting requires it.

### D2 — No index or database; scan per command

Decision: every command reads the `prompts/` directory and parses files on
each run. No cache, no persisted index.
Rationale: files stay the source of truth; expected vault sizes (hundreds of
small files) make scanning cheap. Revisit only with real performance evidence.

### D3 — Canonical text form: UTF-8, LF

Context: spec says read accepts BOM and LF/CRLF; write uses UTF-8 and LF;
body must be preserved without destructive trimming.
Decision: on read, strip a UTF-8 BOM and canonicalize CRLF → LF; on write,
always UTF-8 with LF and no BOM. Apart from that, body content is preserved
verbatim (no trimming, no rewrapping, blank lines kept).
Rationale: one canonical form keeps `show`/`render`/`search` consistent across
platforms and makes multi-line search behave identically in every file.
"Preserve" is interpreted as no lossy editing, not as byte-level CRLF
preservation.

### D4 — Deterministic ordering: ordinal sort by `id`

Decision: all listings and reports sort by `id` using ordinal (UTF-16 code
unit) comparison. No fuzzy ranking anywhere in the MVP.
Rationale: predictability; ids are restricted to `[a-z0-9-]`, so ordinal
order is also the intuitive order.

### D5 — Search semantics: single substring, case-insensitive, per field

Decision: the query is one literal substring compared case-insensitively
(`toLowerCase`) against `id`, `title`, each single tag, and the body. Empty
query is a usage error (exit 2). No wildcards, no tokenization, no AND/OR.
Rationale: simplest useful behavior; multi-term search can come later if
users ask.

### D6 — Vault resolution details

Decision: `--vault` → `PROMPTVAULT_HOME` → `<os.homedir()>/.promptvault`;
relative paths resolve from cwd; an empty `PROMPTVAULT_HOME` is treated as
unset; no `~` expansion; no parent-directory discovery.
Rationale: explicit and portable; `~` expansion differs between shells and
Windows, so absolute paths are documented instead.

### D7 — Strict vault contents

Context: spec requires list/search to fail on an invalid vault file with no
partial output.
Decision: every entry in `prompts/` must be a regular file named `<id>.md`
with valid content. Symlinks, subdirectories, non-`.md` files and invalid
files make `list`/`search` fail (exit 2) and are reported by `doctor`.
Rationale: "no partial output" is only meaningful if the set of files is
well-defined. Tradeoff accepted: stray OS files (e.g. `.DS_Store`) will cause
errors; see Q5 for the revisit condition.

### D8 — Invalid `id` format in `show`/`render` is exit 3

Decision: an id that cannot address any prompt (wrong format, too long,
missing) returns exit 3 ("prompt not found") with a message that includes the
format rule.
Rationale: for the user/script the outcome is the same — the prompt does not
exist. Reserved for revisit if scripts need to distinguish misuse from
absence.

### D9 — `--tag` filter values are validated

Decision: `--tag` must be a valid slug; otherwise exit 2.
Rationale: catches typos in filters instead of silently returning empty
results (which exit 0). Tags are stored in the same grammar, so a validated
filter can never fail to match due to format.

### D10 — `--tags` CSV parsing on `add`

Decision: split on `,`, trim each item; an empty item after trim is a usage
error (exit 2); validate each item as a slug; reject more than 20; then
deduplicate and sort ordinally before writing.
Rationale: explicit rejection beats silently dropping input; stored tags are
canonical (deduped, sorted), keeping outputs deterministic.

### D11 — `render --copy` success and failure behavior

Context: spec says `--copy` copies only after successful validation/rendering
and that clipboard failure must not claim success nor print content.
Decision: render and validate in memory; copy; only after a successful copy
print the rendered body to stdout and a confirmation to stderr. On clipboard
failure: exit 1, error to stderr, nothing on stdout.
Rationale: keeps `render`'s invariant ("rendered body on stdout on success")
while guaranteeing that nothing is printed when copying failed.

### D12 — Variable token grammar and substitution

Decision: a variable is `{{` + optional spaces (U+0020) + name + optional
spaces + `}}`, name `[A-Za-z_][A-Za-z0-9_]*`. Only well-formed tokens are
variables; everything else (including nested/odd brace structures) is literal
text. Substitution is literal, global, single-pass: replacement values are
never re-scanned or interpreted.
Rationale: smallest grammar that satisfies the spec; malformed input stays
human-readable instead of erroring on brace soup.

### D13 — `--var` validation order and errors

Decision: split each pair on the first `=`; validate key grammar; duplicates
→ error; extract body tokens; missing values → error; unused values → error.
All exit 2 with nothing on stdout. Values are never echoed in any message.
Rationale: deterministic first-error reporting; typo detection without
leaking values.

### D14 — Exit code mapping details

Decision: invalid vault data → 2; `doctor` findings → 2 (clean 0, unreadable
1); `init` blocked by filesystem state → 1; `add` conflict → 2; unknown
command/option → 2 (Commander `exitOverride`). Empty results are always 0.
Rationale: matches the spec's four-code table with the fewest surprises;
invalid *data* is consistently 2 everywhere.

### D15 — Control-character output policy

Decision: human and JSON outputs escape every code point < U+0020 (except tab
and LF, emitted literally in human output) plus U+007F and C1 U+0080–U+009F,
as `\uXXXX`. Files are never modified by escaping. No ANSI/OSC is ever
emitted. Vault data echoed in messages uses the same escaping.
Rationale: prompt bodies may contain arbitrary bytes intended for other
tools; escaping prevents terminal control injection without touching the
stored data. See ARCHITECTURE § 8.

### D16 — Output channels and message format

Decision: stdout = requested data only; stderr = operational messages and
errors, prefixed `promptvault: ` / `promptvault: error: `. JSON is pretty
printed with 2 spaces plus trailing newline and nothing else on stdout.
Rationale: scriptable, testable, greppable.

### D17 — Empty results are quiet successes

Decision: no matches produce zero stdout lines (human) or `[]` (JSON), exit
0, and no stderr chatter.
Rationale: empty is a normal outcome, not an error.

### D18 — Position of global `--vault`

Decision (updated in Stage 2): `--vault` is accepted before or after the
subcommand, e.g. `promptvault --vault ./v list` and
`promptvault list --vault ./v`. Both positions are pinned by integration
tests; this resolves Q6.
Rationale: Commander 15 treats program options as global and parses both
positions with no extra code (verified empirically in Stage 2, DECISIONS D33);
rejecting one position would cost code and surprise users for no benefit.

### D19 — `doctor` report goes to stdout

Decision: the doctor report is the requested data → stdout; findings do not
change files. No `doctor --json` in the MVP.
Rationale: consistent with the stdout/stderr rule; JSON can be added later on
request.

### D20 — Exclusive create, not atomic temp+rename

Decision: creation uses `open(path, 'wx')`; a crash may leave a partial file,
which `doctor` reports. Temp-file + rename was rejected.
Rationale: rename would replace an existing file in a race, weakening the
"never overwrite" guarantee; partial-file risk is visible and recoverable.

### D21 — File must start with the `---` delimiter

Decision: after BOM stripping, the first line must be exactly `---`; leading
blank lines or other content make the file invalid.
Rationale: one unambiguous start rule; keeps "delimiter-line scan" simple.

### D22 — Body emptiness check

Decision: a body is non-empty when it contains at least one non-whitespace
character. Leading/trailing whitespace is never trimmed.
Rationale: rejects meaningless prompts while preserving content exactly as
authored.

### D23 — `schemaVersion` mismatch is invalid data

Decision: `schemaVersion` must be the YAML number `1`; any other value or
type (including the string `"1"`) makes the file invalid (exit 2 in
list/search; reported by doctor) with a message mentioning the expected
version.
Rationale: fail explicit on future/foreign schemas instead of misreading.

### D24 — Windows reserved device names not special-cased

Context: ids like `con`, `nul` can fail on Windows because the OS reserves
those file names.
Decision: not special-cased in the MVP; the OS error surfaces as an I/O
failure with a clear message. Revisit only if users hit it (Q7).
Rationale: keeping id validation cross-platform identical; a narrow
platform quirk is not worth a rule that all platforms must carry.

### D25 — Tests never inherit the real environment vault

Decision: integration tests always spawn the CLI with an explicit
`--vault` pointing at a temp directory AND override `PROMPTVAULT_HOME` in the
child environment.
Rationale: guarantees tests can never read or write a developer's real vault.

### D26 — Language conventions

Decision: repository artifacts (code, comments, docs, CLI messages) are in
English; work is explained to the user in Portuguese.
Rationale: open-source audience vs. user preference; keeps interfaces stable.

### D27 — Small-file discipline

Decision: files preferably below 300 lines; review separation when growing;
1000 lines is the practical hard limit. No empty placeholder files or module
trees.
Rationale: matches the "small tool" goal and keeps review cheap.

### D28 — Dependency policy

Decision: the approved stack is fixed (ARCHITECTURE § 10). Any new dependency
requires justification, considered alternatives and explicit user approval.
Versions are verified with `npm view` before install; never invented.
Rationale: supply-chain surface and scope discipline for a small tool.

## Resolved in Stage 1 (repository bootstrap)

### D29 — TypeScript pinned to the 6.0.x line

Context: the latest registry version is TypeScript 7.0.2, but
typescript-eslint 8.71.2 declares peer support `>=4.8.4 <6.1.0`.
Decision: install `typescript@^6.0.3` (resolved: 6.0.3).
Rationale: keeps the lint gate working on the newest TypeScript line the
tooling supports. Revisit when typescript-eslint supports TS 7.

### D30 — Tooling additions and pins beyond ARCHITECTURE § 10

Context: ESLint cannot parse TypeScript without its official integration;
`@types/node` latest is 26.x while the runtime target is Node 24.
Decision: add `typescript-eslint` (8.71.2), required to lint TS with the
already-approved ESLint (the only alternative is dropping the lint gate, or
losing TS parsing entirely); pin `@types/node` to `^24` (resolved: 24.19.2) to
match the Node 24 runtime — 26.x types describe APIs that do not exist there.
Prettier runs with default settings; `.prettierignore` excludes Markdown so
docs keep their hand-wrapped layout.
Rationale: smallest addition that makes the approved gates real; flagged to
the user in the Stage 1 report for explicit confirmation (D28).

### D31 — Package metadata stays unpublished until release

Decision: `package.json` sets `"private": true` and
`"license": "UNLICENSED"` for now.
Rationale: blocks accidental `npm publish` (AGENTS.md § 4) while Q1 (license)
and Q2 (publishing) are open; both flip at Stage 11 on explicit request.

Status note (Stage 11 closure, D58): the license half is done — the field is
now `"license": "MIT"`; `private: true` remains and publishing still waits
for an explicit request (Q2).

### D32 — Version has a single source, enforced by a test

Decision: `src/version.ts` exports the `VERSION` constant used by the CLI;
`tests/unit/version.test.ts` fails if it diverges from `package.json`.
Rationale: importing `package.json` through the `dist/cli` build layout is
brittle; a test makes the sync enforced instead of hoped for.

### D33 — Commander Stage 1 findings and exit mapping

Context: the skeleton uses `exitOverride()` plus custom output writers.
Findings: (1) Commander 15 rejects stray operands itself ("too many
arguments") before user code can label them; (2) parse errors print with an
`error: ` prefix.
Decision: map non-zero Commander exits to exit 2 and rewrite the prefix to
`promptvault: error: `; enable `allowExcessArguments(true)` temporarily so
the command-less skeleton can emit its own `unknown command` message. Q6
(global option position around subcommands) was not testable — Stage 1
defines no subcommands — and moves to Stage 2.
Rationale: keeps the exit-code contract in one place; both workarounds are
revisited when the first real subcommand lands (Stage 2).

Stage 2 update (with `init` registered): (1) `allowExcessArguments(true)` was
removed — with subcommands defined, Commander reports unknown commands itself
(`unknown command 'x'`, exit 2 after mapping) and the workaround only weakened
subcommand argument checking; (2) a bare invocation displays usage via
Commander with its own exit 1, mapped to exit 2 on stderr, matching CLI_SPEC
§ 1; (3) the Stage 1 `too many arguments` behavior no longer occurs.

## Resolved in Stage 2 (vault resolution + `init`)

### D34 — A blank `--vault` value is a usage error

Context: CLI_SPEC § 2 declares a blank `PROMPTVAULT_HOME` unset, but is silent
about an explicitly blank `--vault`.
Decision: a blank (empty or whitespace-only) `--vault` value is invalid usage
(exit 2, `invalid --vault value: empty path`). A blank `PROMPTVAULT_HOME`
remains "unset" per spec.
Rationale: silently falling back to another source would hide a script bug
(strict validation, ARCHITECTURE § 1).

### D35 — Commander's implicit `help` subcommand is disabled

Context: Commander injects a `help [command]` subcommand by default; CLI_SPEC
§ 5 documents no such command.
Decision: `addHelpCommand(false)`. `promptvault help` is an unknown command
(exit 2); the `--help` / `-h` flags keep working for the program and its
subcommands.
Rationale: the shipped command surface stays exactly as documented; one-line
flip if the command is ever wanted.

### D36 — `init` performs only the `lstat` half of the ARCHITECTURE § 6 guard

Context: ARCHITECTURE § 6 resolves `prompts/` with `realpath` after an `lstat`
verification; `init` builds no target paths.
Decision: `initVault` creates directories recursively, then verifies with
`lstat` that `prompts/` is a real directory (symlink → exit 1, CLI_SPEC
§ 5.1). `realpath` is applied in the stages that build target file paths
(add/show/render), which is what the resolution exists for.
Rationale: no observable difference for `init`; avoids carrying an unused
resolved path.

- Q6 (`--vault` after the subcommand) resolved: **D18 updated** — both
  positions accepted, pinned by integration tests.

## Resolved in Stage 3 (prompt format)

### D37 — Limits counted in code points; size in bytes

Context: ARCHITECTURE § 3 limits id to 80 and title to 120 "chars" and the file
to 1 MiB of UTF-8 bytes, without defining the "char" unit.
Decision: id and title limits count Unicode code points
(`countCodePoints` in `src/core/prompt-rules.ts`); the size limit counts UTF-8
bytes of the raw file. Ids are ASCII by grammar, so only titles are affected.
Rationale: "char" for a user is the code point; bytes are already explicit in
the spec for the file size.

### D38 — "Trimmed non-empty" title: lenient read, trim on write

Context: ARCHITECTURE § 3 and CLI_SPEC § 5.2 call the title "trimmed
non-empty" without saying whether a stored title must equal its own trim.
Decision: read validation requires a non-blank title (non-empty after trim),
no `\n`/`\r` and at most 120 code points; it does not require the stored value
to be pre-trimmed. `add` (Stage 4) trims CLI input before writing, so
tool-written files are canonical. The trim happens before validation: a title
whose trimmed form is ≤120 code points is accepted, and the stored value is
always the trimmed form (a title that is blank only through whitespace is
rejected).
Rationale: rejects meaningless titles without failing valid hand-authored files
over cosmetic whitespace, keeping the D3 "preserve content" spirit on read.

### D39 — YAML reading/writing options are pinned

Context: ARCHITECTURE § 3 reads "YAML 1.2 core schema (JSON-compatible
subset)", single document, no aliases, no custom tags, duplicate keys
rejected; serialization must match the § 3 example.
Decision: `parseAllDocuments(yamlText, { schema: "core", uniqueKeys: true })`.
Findings from probes: the `yaml` package's `"json"` schema refuses every plain
scalar ("Unresolved plain scalar"), which would reject normal front matter —
hence `"core"`. Duplicate keys surface as document errors ("Map keys must be
unique"). Custom tags surface only as *warnings* ("Unresolved tag: !foo"), so
they are rejected by an explicit AST walk (`assertInert`) that also rejects
anchors and aliases; more than one YAML document is rejected. Serialization
uses the default schema with `lineWidth: 0`: output is byte-identical to the
§ 3 example and long titles are never folded.
Rationale: only the walk makes "no aliases/custom tags" enforceable; disabling
line folding guarantees round-trips for titles that wrapping would rewrite.

### D40 — Filename-vs-id rule is enforced at load time (Stage 5)

Context: ARCHITECTURE § 3 requires the file name to equal `id` + `.md`, compared
case-sensitively, but `parsePrompt` works on content only, with no path.
Decision: `parsePrompt`/`serializePrompt` are pure content functions; the
filename check is performed by the storage layer when loading (`list`,
`search`, `show`), the only place that knows both a path and the parsed id.
Rationale: keeps `core` free of I/O and puts the check where a mismatch is
observable.

### D41 — `add` failure mapping

Context: CLI_SPEC § 5.2 fixes exit codes for some `add` failures (conflict,
uninitialized vault) but not for `--file`-related ones.
Decision: unreadable `--file` (missing, permissions, directory) → exit 1
(`IoError`; CLI_SPEC § 3 lists "unreadable file" under 1). Body file too large
(> 1 MiB), invalid UTF-8 or empty/whitespace-only → exit 2 (`InvalidPromptError`;
the file's content is invalid prompt data). Uninitialized vault → exit 2 with
the init hint; `prompts/` being a symlink or a non-directory → exit 1, matching
`init` (D36). Existing target → exit 2 (`CreationConflictError`).
Rationale: keeps "I/O happened and failed" (1) distinct from "data or usage is
invalid" (2), consistent with the rest of the CLI.

### D42 — `add` validation order is fixed

Context: several failures can coexist (bad id plus missing vault, etc.) and
CLI_SPEC does not state which one is reported.
Decision: `resolveVault` (path resolution only) → `requireValidId` →
`normalizeTitle` → `parseTagList` → `resolvePromptsDir` → read/decode/validate
body → exclusive write. The first failing step is reported and nothing is
written. Docs updated accordingly (ROADMAP Stage 4).
Rationale: cheap pure checks run before any I/O, results are deterministic and
consequently testable; the order mirrors ARCHITECTURE § 5 ("resolve → validate
id/title/tags → read body file → build → serialize → exclusive write").

### D43 — `list`/`search` loading and error aggregation

Context: CLI_SPEC §5.3 requires every entry in `prompts/` to be valid before
any output ("no partial output") and errors to name the file(s); the catalog
shows one message per file, but several files may be broken at once.

Decision: `loadAllPrompts` (storage) iterates entries in ordinal name order
and classifies each as symlink / not a regular file / not `.md` / invalid
content (parse or schema) / name-vs-id mismatch, collecting findings as
`invalid prompt file <name>: <reason>` (entry name, escaped per §8; not the
absolute path). All findings are thrown together as one `InvalidPromptError`
joined with `; ` (exit 2), so callers cannot print partial results. Unreadable
entries (I/O) are `IoError` (exit 1). The loader returns prompts sorted by
`id` (ordinal, D4); the `list` command validates `--tag` (exit 2) before
touching the filesystem, and filters by exact tag match afterwards.

Rationale: one deterministic error per run is safe and testable; name-only
messages stay short while the vault is known from the invocation; sorting in
the loader gives `list` and `search` identical order for free.

### D44 — JSON output reuses the human escaping pass

Context: D15/§8 apply control-character escaping to "both human and JSON
output"; `JSON.stringify` escapes code points < U+0020 itself but emits DEL
and C1 raw, which could still reach a terminal through `--json`.

Decision: every string field passes through `escapeText` before
`JSON.stringify`. Control characters (except tab and LF) become the literal
text `\uXXXX` first; JSON then escapes that backslash, so the raw bytes
contain `\\uXXXX` and a parsing consumer receives neutralized text, never a
raw control character. Tab (titles only) passes `escapeText` through and JSON
serializes it as `\t`, parsed back as a real tab — consistent with its "safe"
status in human output; titles cannot contain LF.

Rationale: a single escaping policy for both renderings; no ESC/DEL/C1 can
reach a terminal via `--json`; behavior is easy to pin in tests.

### D45 — Prompt bodies are streamed raw; escaping applies to structured output

Context: ARCHITECTURE §8 says control-character escaping applies to "both
human and JSON output", but CLI_SPEC §5.4 and the PRD acceptance list require
`show` to print "only the body, as stored" with "no extra text on stdout";
`render` (§5.5) prints the rendered body the same way. Escaping the body would
violate "as stored" and corrupt text piped or copied to other tools.

Decision: bodies streamed to stdout by `show` (and later `render`) are
byte-exact and exempt from the §8 escaping pass. The §8 policy applies to
structured fields — ids, titles, tags, paths, diagnostics, list/search rows
and JSON — and to vault data echoed in messages. `--copy` will carry the same
raw rendered text (Stage 9).

Rationale: byte-exactness is the command's contract and its test evidence
("no added trailing newline"); the vault is local and user-owned, while every
other output path keeps the D15 neutrality guarantee. The one-line exception
is recorded in ARCHITECTURE § 8.

### D46 — `show` error mapping and lookup order

Decision: `loadPrompt` validates `<id>` against the slug rule before any path
is built (malformed ids — `Bad`, `..`, `a/b`, empty — never touch the
filesystem) and reports them as `prompt not found: <id>` (exit 3), same as a
missing `<id>.md`. An existing but invalid entry (symlink, non-regular file,
parse/schema failure, name-vs-id mismatch) is `invalid prompt file <id>.md:
<reason>` (exit 2, same wording as D43). A valid id in an uninitialized vault
is the usual exit 2 with the init hint; unreadable files or `lstat` failures
are exit 1.

Rationale: matches CLI_SPEC § 3 ("prompt not found; also an id in invalid
format") while keeping vault-level and I/O failures distinct; validating the
id first also guarantees no path is ever built from unvalidated input.

### D47 — `search` implementation

Context: §5.5/D5 fix the semantics (one literal, case-insensitive substring
against id, title, each tag and body; `--tag` combined; list's validation,
ordering and output); the implementation details were still open.

Decision: matching lives in `src/core/search.ts` (`promptMatches`, Unicode
`toLowerCase` on the query and each field). Only the empty string is rejected
(exit 2, `empty search query`); whitespace is a literal substring. The
command order is: resolve vault → query check → `--tag` check (D9) →
`loadAllPrompts` (D43, all-or-nothing) → filter (query AND tag) → shared
`formatPromptRows` (D16/D44). No results stay a quiet success (exit 0).

Rationale: reusing the D43 loader and the shared formatter guarantees `search`
and `list` cannot drift apart in validation, ordering, escaping or output
shape; rejecting only `""` keeps the literal semantics honest.

### D48 — `render` implementation

Context: § 5.6, § 5 (flow), § 7 (validation order), D12 and D13 fix the
semantics; message wording for malformed pairs, name listing order and the
success output were still open.

Decision: `src/core/variables.ts` holds `extractVariables` and
`substituteVariables` (one leftmost-match scanner shared by both, so token
boundaries can never disagree), `parseVariablePairs` (split on the first `=`;
no `=` → `invalid --var: expected key=value`, raw pair not echoed; bad key →
`invalid --var key "<escaped key>"`; duplicate → `duplicate --var key:
<name>`) and `renderBody` (parse → extract → missing listed in appearance
order → unused listed in provision order; names joined with `, `; values
never echoed). Command order: resolve vault → `loadPrompt` (D46) →
`renderBody` → raw body on stdout (D45). Plain `render` writes nothing to
stderr; the `--copy` confirmation arrives in Stage 9. Only the addressed
file is read, so non-addressed invalid files do not affect `render` (same
single-file behavior as `show`).

Rationale: a single scanner keeps extraction and substitution provably
consistent; keys-only diagnostics satisfy "values are never echoed";
following § 5's flow keeps error precedence deterministic and aligned with
`show`.

### D49 — `render --copy` implementation

Context: D11 fixes the behavior; § 5.6 and the catalog fix exit 1 with
`clipboard unavailable: <system message>`; the confirmation wording and the
copy details were still open.

Decision: `src/shared/clipboard.ts` wraps `clipboardy` (5.3.2, the approved
stack entry) in `copyToClipboard`; any failure becomes an `IoError` whose
message carries only the system error text, whitespace-collapsed to one line
and control-escaped, with `unknown error` as fallback. `--copy` copies the
exact bytes that go to stdout, in the order render → copy → stdout body →
stderr confirmation `copied to clipboard`. `clipboardy` is the only mocked
border in tests: unit tests drive the real command wiring in-process with
the OS clipboard replaced; integration tests never spawn `--copy`, so no
test touches a developer's clipboard.

Rationale: mapping failures at one small border keeps the command logic
testable without OS coupling; copying the output bytes makes the clipboard
and stdout provably identical.

### D50 — `doctor` scan and report

Context: § 5.7 and D14/D19 fix the behavior (read-only, report on stdout, no
`--json`, exit 0/2/1); the report shape, the uninitialized-vault handling and
the scan reuse were open.

Decision: `src/storage/prompts.ts` exposes `scanPromptsDir`, which evaluates
every entry in `prompts/` without stopping at findings and returns them in
ordinal name order; `loadAllPrompts` is built on it and keeps the D43
aggregate message exactly (`invalid prompt file <name>: <reason>` joined with
`; `). A readdir failure is now a typed `IoError` (exit 1). `doctor` renders
the report from the same scan (CLI_SPEC § 5.7): `vault: <path>`,
`prompts: <n> file(s)`, one `OK     <name>` / `ERROR  <name>: <reason>` line
per entry (label padded to 7 columns), `summary: <n> ok, <m> error` with
invariant wording, trailing newline; every string escaped (D15); bodies never
printed. A missing `prompts/` directory (uninitialized vault) becomes the
single problem line `ERROR  vault not initialized; run "promptvault init"`
with `summary: 0 ok, 1 error` and exit 2; any other unreadable vault or entry
stays an `IoError` (exit 1), matching D43/D14. Exit 0 only when nothing was
reported.

Rationale: one scan keeps `list`/`search`/`doctor` from ever disagreeing on
what an invalid entry is; reporting the uninitialized vault as data (exit 2)
matches § 5.7 ("reported as a problem") instead of failing like other
commands; the padded two-term label keeps the report greppable.

## Resolved in Stage 11 (audit and distribution prep)

### D51 — License metadata without inventing the holder

Context: Q1 had MIT as the assumed default; the user confirmed the intent in
the Stage 11 request, but no legal name exists anywhere in the project, and a
copyright line must not be invented.

Decision: `package.json` declares `"license": "MIT"` (an SPDX identifier needs
no holder), `private: true` stays, and no `LICENSE` file is created until the
maintainer confirms the copyright holder legal name. The missing datum and
the blocked file are registered in Q1, the README and the ROADMAP.

Rationale: metadata now reflects the real intent, while the one artifact that
would require a fabricated fact stays deliberately absent.

### D52 — Packaging for local-tarball distribution

Context: Stage 11 must prepare the package for distribution without
publishing; `files: ["dist"]` already restricted the tarball to the compiled
CLI plus manifest.

Decision: keep `files: ["dist"]`; add `prepack: npm run build` so `npm pack`
can never ship a stale `dist/`; ignore `*.tgz` in git. Add
`scripts/smoke-pack.mjs` (`npm run smoke:pack`) as the reproducible
install-and-exercise check: it builds, packs into a temp directory, installs
the tarball into a throwaway project outside the repository, and drives the
installed CLI (via `node dist/cli/main.js` and, on Windows, the generated
`.cmd` shim) from a temp cwd with a throwaway `PROMPTVAULT_HOME`. The smoke
never passes `--copy` and never reads a real vault.

Rationale: the risky step of a pack handoff is a stale or incomplete
artifact; `prepack` removes that structurally, and the smoke proves the
tarball end to end on the machine that produced it.

### D53 — CI scope

Context: Q3 left CI undecided; the Stage 11 request asks for a workflow for
Windows/Linux/macOS on Node.js 24 running the real gates.

Decision: `.github/workflows/ci.yml` runs the five existing gates
(`format:check`, `lint`, `typecheck`, `build`, then `test`) on the three-OS
matrix with `npm ci`, `permissions: contents: read` and the actions pinned to
`actions/checkout@v7` / `actions/setup-node@v7` (versions verified in October
2026). No secrets, no publish steps, no install-script flags, no dependency
updates. The packaging smoke stays out of CI for now (it needs registry
access and is reproducible locally). The workflow has not executed yet;
results must not be claimed before the first remote run (Q3).

Rationale: the matrix mirrors the verification the project cannot do on one
machine; keeping the smoke manual avoids a second network-dependent job
before the first run is even validated.

### D54 — Excess arguments are rejected, and that is tested

Context: the Stage 11 audit probed `list extra` and `show <id> extra`; both
exit 2 with Commander's `too many arguments for '<command>'` message. The
behavior traces back to removing the Stage 1 `allowExcessArguments(true)`
workaround and had no regression test.

Decision: keep the rejection (strict, explicit validation per ARCHITECTURE
§1) and pin it with two regression tests in `tests/integration/cli.test.ts`.

Rationale: this behavior was once toggled by a Commander option; a cheap test
prevents silently re-widening argument acceptance.

### D55 — Integration test timeout raised from the 5s default

Context: during Stage 11 verification, two full-suite runs failed with `Test
timed out in 5000ms` — each time on different pre-existing tests (add, list,
show), while the same files passed in isolation. Every integration test
spawns the real CLI through `node --import tsx`; with test files running in
parallel, the 5s vitest default is too tight on a loaded Windows machine and
makes the gate nondeterministic.

Decision: set `testTimeout: 30000` in `vitest.config.ts` (with an explanatory
comment). Assertions still decide failures; a genuinely stuck test fails
after 30s instead of flaking earlier. Two consecutive full runs (22 files,
208 tests) passed afterwards.

Rationale: a gate that fails depending on machine load cannot back a "done"
claim, locally or in the new CI matrix; raising the timeout removes the
environment dependence without weakening any assertion.

### D56 — Test worker tripwire `PROMPTVAULT_HOME` is never materialized

Context: the Stage 11 audit found 148 leftover `promptvault-test-env-home-*`
directories under the OS temp directory. `runCli` created one `mkdtempSync`
directory per forked worker and relied on `process.once("exit")` (D25) to
remove it, but vitest force-terminates its workers on Windows, so the hook
never ran; every full suite leaked about one directory per worker.

Decision: `defaultEnvHome()` now returns a unique but never-created path
(`os.tmpdir()/promptvault-test-env-home-<uuid>`). Nothing changes for a
correctly behaving CLI (uninitialized vault either way); a CLI that wrongly
fell back to the default home would create files under that path instead of
touching a real vault, which is exactly the evidence a bug hunt needs. The
accumulated residue was removed.

Verified: a full suite run adds zero new directories (148 before and after
the run), 208 tests green.

Rationale: an in-process cleanup hook cannot be fixed against a hard kill;
not creating the directory removes the leak class entirely with no change in
test semantics.

### D57 — License field reverted to `UNLICENSED` until holder and year exist

Context: D51 set `package.json` to `"license": "MIT"` while the `LICENSE`
file stayed deliberately absent, leaving a declared-but-undeliverable
license state. The Stage 11 closure review flagged that intermediate state as
divergent from the instruction to avoid it; the lockfile root entry still
said `UNLICENSED`, so the field also disagreed with `package-lock.json`.

Decision: `package.json` declares `"license": "UNLICENSED"` again;
`private: true` is unchanged; the MIT intent, the blocked `LICENSE` file and
the exact missing data (copyright holder legal name and year) remain recorded
in D51 and Q1. Nothing about the missing data was invented. D51 is kept as
history; this entry supersedes it on the field value only.

Rationale: metadata must not advertise a license the repository cannot
deliver yet, and reverting also restores package.json/lockfile agreement.
Unblocking still requires only the holder name and year.

### D58 — License finalized: MIT with confirmed holder and year

Context: D57 reverted the license field to `UNLICENSED` until the copyright
holder and year existed. The maintainer then confirmed: holder "Lucas Enzo
Marcon", year 2026, license MIT.

Decision: the repository carries MIT end to end, added in one change so no
intermediate state exists: `LICENSE` with the canonical MIT text and the
confirmed copyright line (`Copyright (c) 2026 Lucas Enzo Marcon`), plus
`"license": "MIT"` in `package.json` and in the lockfile root entry.
`private: true` is unchanged — publishing stays a separate, explicitly
requested step (Q2).

Rationale: the only blocker recorded in Q1 was the holder/year data; with it
confirmed, the file and metadata follow without any invention.

### D59 — Local Git repository initialized (no remote, no commits yet)

Context: the project was built and audited as a plain directory; the README
stated it was not a Git repository yet.

Decision: `git init -b main` in the project root (branch `main`); no remote,
no commit and no tag — all on explicit request only. `.gitignore` extended
beyond `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo` and `*.tgz` to
also cover local vaults (`/prompts/`, `.promptvault/`), environment and
credential files (`.env`, `.env.*` except `.env.example`, `.npmrc`), logs,
temporaries and OS cruft (`*.log`, `npm-debug.log*`, `*.tmp`, `.DS_Store`,
`Thumbs.db`, `Desktop.ini`) and generated test reports (`test-results/`).
README status bullet updated accordingly.

Rationale: keeps personal prompt data, credentials and build/test artifacts
out of version control with no product change. The line-ending strategy
(`core.autocrlf` is enabled in this environment; there is no `.gitattributes`
yet) remains open for the first-commit step.

Status note (D60): resolved — line endings are pinned in `.gitattributes`
(LF by default, CRLF for `*.bat`/`*.cmd`).

### D60 — Line-ending policy: LF everywhere, CRLF for Windows scripts

Context: D59 left the line-ending strategy open: `core.autocrlf=true` comes
from the Git for Windows system config (not changed) and there was no
`.gitattributes`, so Windows checkouts could materialize CRLF in the working
tree while other platforms keep LF — noisy diffs and platform-dependent
behavior. No candidate file currently stores intentional CR/CRLF bytes
(verified with `git grep -P "\r"`), and the CRLF-handling tests build their
fixtures at runtime from escape sequences, so no committed fixture depends
on specific bytes.

Decision: add `.gitattributes` with `* text=auto eol=lf` as the repo-wide
policy, plus `*.bat`/`*.cmd` forced to CRLF (`text eol=crlf`). No such files
exist in the repository today; the rule is forward-looking for Windows
command scripts. No per-file exceptions are needed today; a future fixture
with intentional bytes would get a specific rule (e.g. `-text` or an
explicit `eol`) next to the existing ones.

Rationale: one deterministic policy for every platform — blobs stored with
LF and the working tree always LF (the explicit `eol=lf` overrides
`autocrlf`), except the two Windows script extensions. The change rewrites
nothing by itself; it takes effect at add/checkout time.

## Open questions

- **Q1 — License.** Resolved in the Stage 11 closure review: MIT finalized
  with the confirmed copyright line (`Copyright (c) 2026 Lucas Enzo Marcon`);
  `LICENSE` added and the SPDX field set in `package.json` and the lockfile
  (D58, after D51/D57). Publishing remains a separate decision (Q2).
- **Q2 — Package name and publishing.** Whether to publish to npm at all, and
  whether `promptvault` is available, is undecided. Publishing requires
  explicit user request (AGENTS.md § 4). Stage 11 prepared local-tarball
  distribution only (D52); `private: true` remains and nothing was published.
- **Q3 — CI.** Resolved in Stage 11 as scope (D53): the workflow exists for
  Windows/Linux/macOS on Node.js 24 with the five gates. Still pending: the
  first execution on a hosted repository, which requires a push (not done).
  Until it runs, the matrix counts as configured, not verified.
- **Q4 — Coverage thresholds.** No coverage gate is defined; tests are
  required per domain rule instead. Revisit if the suite needs a numeric
  floor.
- **Q5 — Dotfile tolerance in `prompts/`.** D7 makes stray files hard errors
  (e.g. `.DS_Store`). If real usage shows pain, a later stage may ignore
  dotfiles explicitly (documented change), never silently.
- **Q7 — Reserved file names on Windows.** Revisit only if D24 bites a real
  user.
- **Q8 — Large vaults.** If scanning ever becomes slow in practice, an index
  would contradict D2; treat as evidence-required before any change.
- **Q9 — Raw output mode.** Whether users ever need unescaped raw bytes on
  stdout (e.g. piping bodies to other tools that interpret them). Not in the
  MVP; the escaping policy (D15) is deliberate.
- **Q10 — Richer search.** Tokenized, multi-term or tag-AND queries are out
  of MVP scope; collect real usage before extending D5.
- **Q11 — Security reporting channel.** No private channel exists yet.
  SECURITY.md now asks reporters to open an issue only to *request* a private
  contact, with no details, and forbids sensitive data in that request.
  Planned channel: GitHub Private Vulnerability Reporting, which can only be
  enabled once the repository exists as a public project — it is **not
  enabled or configured**. Release blocker: enable it and update SECURITY.md.

## Inconsistencies resolved in this baseline

Recorded here for traceability; details above.

- Read tolerates CRLF vs. "preserve body" → resolved by D3 (canonical LF).
- `--copy` failure wording implied print-on-success → resolved by D11.
- Invalid id in `show`/`render`: usage error vs. not found → resolved by D8.
- "Arquivo inválido falha list/search" vs. arbitrary stray files → resolved
  by D7 (strict).
- `--tag` with invalid format: error vs. empty result → resolved by D9.
- `--tags` empty CSV items: ignore vs. reject → resolved by D10 (reject).
- Global option position ambiguity → resolved by D18 (updated in Stage 2:
  both positions accepted).
- Front-matter start ambiguity (blank lines before `---`) → resolved by D21.
