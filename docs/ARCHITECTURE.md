# PromptVault — Architecture

Status: MVP design · applies to `schemaVersion: 1` · complements `docs/CLI_SPEC.md`

## 1. Design principles

- Offline at runtime; no network, no telemetry.
- Markdown files are the source of truth; no database, no persistent index.
- Strict, explicit validation: invalid data fails loudly, never partially.
- Small functions and small modules; composition over frameworks.
- Data (prompt content) is inert: never executed, never interpreted, never
  treated as instructions by the tool or by agents (see `AGENTS.md` § 2).

## 2. Vault layout and resolution

```
<vault>/
  prompts/
    <id>.md
```

- Only `prompts/` is created by the MVP. `config.json` is not part of the MVP
  and must not be created preemptively.
- Resolution order:
  1. `--vault <path>` (global CLI option)
  2. `PROMPTVAULT_HOME` environment variable
  3. `<os.homedir()>/.promptvault`
- Relative paths from `--vault` or `PROMPTVAULT_HOME` resolve against the
  current working directory. An empty/blank `PROMPTVAULT_HOME` is treated as
  unset. No `~` expansion (document absolute paths); no discovery of vaults in
  parent directories.

## 3. Prompt file format

Canonical form written by `add`:

```
---
schemaVersion: 1
id: code-review
title: Review a code change
tags:
  - development
  - review
---
Review the following {{language}} code.

Focus on:
- Correctness
- Security
- Maintainability
```

Normative rules:

- The file starts with a line containing exactly `---`, after an optional
  UTF-8 BOM is stripped. Content before it → invalid.
- The front matter is YAML between the first two `---` delimiter lines; the
  body is everything after the second delimiter. The body may contain `---`
  lines freely — parsing is delimiter-line based, never a naive split.
- YAML restrictions: YAML 1.2 core schema (JSON-compatible subset), a single
  document, no custom tags, no aliases (reject), duplicate keys rejected.
- Metadata schema (validated with Zod, strict mode):

| field | type | rules |
|---|---|---|
| `schemaVersion` | number | exactly `1` |
| `id` | string | slug, ≤ 80 chars |
| `title` | string | trimmed non-empty, no `\n`/`\r`, ≤ 120 chars |
| `tags` | string[] | optional, default `[]`, ≤ 20 items, each slug |

- Slug grammar: `^[a-z0-9]+(?:-[a-z0-9]+)*$` (ASCII lowercase, digits, single
  hyphens between segments).
- Unknown properties → invalid (rejects typos instead of silently ignoring).
- Body: at least one non-whitespace character; internal content preserved (no
  trimming, no line re-wrapping, no collapsing of blank lines). Line endings
  are canonicalized to LF.
- File name must equal `id` + `.md`, compared case-sensitively (even on
  case-insensitive filesystems).
- Whole file ≤ 1 MiB of UTF-8 bytes; invalid UTF-8 → invalid.
- Read: strip BOM, accept LF or CRLF (canonicalized to LF). Write: UTF-8, LF,
  never a BOM.
- Serialization: `---\n` + YAML stringify + `---\n` + body, so that
  `add` → read round-trips the body verbatim (modulo LF canonicalization) and
  `show` prints exactly the stored body.

## 4. Modules and responsibilities

```
src/
  cli/        command registration and per-command wiring (thin)
  core/       pure domain logic (no I/O)
  storage/    filesystem access (vault resolution, read/write)
  shared/     small cross-cutting helpers (errors, escaping, output)
```

Rules of thumb (create files only when a stage needs them):

- `core/`: no `node:fs`, no direct `process` access; pure functions + typed
  errors. Expected modules: id/slug rules, prompt parse/serialize, metadata
  schema, variables extraction + substitution, search matching, ordering.
- `storage/`: the only place importing `node:fs`; maps OS errors to typed
  errors. Expected functions: `resolveVault`, `initVault`, `loadPrompt`,
  `loadAllPrompts`, `writePromptExclusive`, `scanVault` (doctor).
- `cli/`: parses argv (Commander), calls core + storage, writes stdout/stderr,
  maps errors to exit codes. One module per command; no business rules here.
- `shared/`: typed error classes + exit-code mapping, control-character
  escaping, JSON writer wrapper, ordinal compare.

No dependency injection framework, no event bus, no plugins. Construct
directly; pass resolved paths as parameters.

## 5. Data flow (per command)

- `init`: resolve vault → create directories (`recursive`) → idempotent
  success if already initialized.
- `add`: resolve → validate id/title/tags and the body source (`--file` or
  `--clipboard`, exactly one; D63) → read the body — file bytes or clipboard
  text encoded to UTF-8 bytes — through the same decode step (size, UTF-8,
  BOM strip, CRLF → LF) → build prompt → serialize → exclusive write
  (`fs.open(path, 'wx')`) → `EEXIST` → creation conflict (exit 2).
- `list` / `search`: resolve → read `prompts/` entries (every entry must be a
  regular file, no symlinks, named `<id>.md`) → parse and validate ALL files
  first (no partial output) → filter/sort → print (human or JSON).
- `show`: resolve → load the addressed single prompt → print its body.
- `render`: resolve → load prompt → extract `{{name}}` tokens → validate
  against `--var` pairs → single-pass substitution in memory → print; `--copy`
  copies only after a successful render.
- `doctor`: resolve → full read-only scan with per-file diagnostics → print
  report → exit code reflects findings.

## 6. Filesystem safety

- Resolve the `prompts/` directory with `fs.realpath` after verifying via
  `lstat` that it is a real directory and not a symlink. Build target paths
  with `path.join(resolvedPrompts, `${id}.md`)`; ids cannot contain
  separators.
- Creation is exclusive: `fs.open(target, 'wx')`; `EEXIST` → typed
  `CreationConflictError` (exit 2). No exists-then-write sequence.
- Prompt entries that are symlinks are invalid: `lstat` each entry; links are
  rejected (doctor reports them; list/search fail).
- Every entry in `prompts/` must be a valid prompt file (regular file, correct
  name, valid content). Subdirectories, non-`.md` files and stray files make
  list/search fail and are reported by doctor. This strictness is a recorded
  decision (DECISIONS.md D7).
- Accepted tradeoff: an exclusive-create write is not atomic against crashes;
  a partial file can remain and doctor will flag it. Temp-file + rename was
  rejected because it weakens the never-overwrite guarantee (D20).

## 7. Variables engine

Grammar: `{{` + optional spaces (U+0020) + name + optional spaces + `}}`,
with name `[A-Za-z_][A-Za-z0-9_]*`. Only well-formed tokens are variables;
anything else (including nested braces) is literal body text.

Behavior:

- Extraction over the body only (metadata is never interpolated).
- Substitution is literal, global and single-pass: each token is replaced by
  the provided value; the value is never re-scanned for further tokens and
  never interpreted (no regex replacement semantics; plain string
  replacement).
- `--var key=value` splits on the FIRST `=` only; values may contain `=` and
  may be empty; values are never logged.
- Errors (exit 2, nothing on stdout): tokens without a value (missing),
  duplicate `--var` keys, and provided variables not used by the body
  (catches typos).
- No defaults, conditionals, loops, includes, or environment access.

Validation order (deterministic error reporting): parse pairs → validate names
→ detect duplicates → extract tokens → detect missing → detect unused.

## 8. Output policy (stdout, stderr, escaping, exit codes)

- stdout: requested data only (bodies, rendered text, list/search results,
  JSON, doctor report).
- stderr: operational messages and errors, prefixed `promptvault: ` /
  `promptvault: error: `.
- JSON outputs: `JSON.stringify(value, null, 2)` plus a trailing `\n`; pure
  JSON, nothing else on stdout.
- Exit codes: `0` success · `1` unexpected/IO/clipboard failure · `2` invalid
  usage/data, missing variable, creation conflict · `3` prompt not found.
- No ANSI/OSC sequences are ever emitted.
- Control-character escaping (applies to both human and JSON output; files are
  never modified by it):
  - Emitted literally in human output: tab (U+0009) and line feed (U+000A).
  - Escaped as `\uXXXX` (lowercase hex, 4 digits): every code point < U+0020
    except tab and LF, plus U+007F (DEL) and the C1 range U+0080–U+009F. This
    neutralizes ESC sequences and C1 CSI before they reach a terminal, in both
    human and JSON output.
  - Any vault data echoed in messages (ids, file names, titles in diagnostics)
    passes through the same escaping.
  - Exception: prompt bodies streamed by `show`/`render` are byte-exact as
    stored and are not escaped (CLI_SPEC § 5.4–5.5, D45); the escaping above
    still applies to every structured field and diagnostic.
- No colors, no progress spinners, no interactive prompts (MVP).

## 9. Determinism

- Ordering: ordinal comparison (UTF-16 code units) of `id`, ascending —
  everywhere (list, search, doctor report).
- JSON shape: array of objects with fixed key order `id`, `title`, `tags`.
- No fuzzy ranking; `search` is literal substring matching.
- Same input → byte-identical output.

## 10. Dependencies (approved list)

| Package | Role | Introduced at |
|---|---|---|
| commander | CLI argument parsing | CLI skeleton (Stage 1) |
| yaml | front-matter parsing (restricted options) | parsing stage |
| zod | metadata schema validation | parsing stage |
| clipboardy | `render --copy` and `add --clipboard` clipboard access | clipboard stage (D49); `add` (D63) |
| typescript, tsx, vitest, eslint, prettier, @types/node | dev tooling | bootstrap (Stage 1) |

- Clipboard access loads `clipboardy` on demand (dynamic import, D63);
  commands that never run a clipboard operation do not load it.
- Runtime dependencies are plain ESM, no native builds.
- New dependencies require justification, considered alternatives and user
  approval (AGENTS.md § 3). Verify real versions with `npm view <pkg> version`
  before installing; never invent version numbers.

## 11. Non-goals (architecture)

No index/cache, no config file, no plugin system, no server mode, no watch
mode, no i18n framework (English only), no logging framework (a small stderr
writer is enough).
