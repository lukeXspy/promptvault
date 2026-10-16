# PromptVault — Product Requirements (MVP)

Status: draft for MVP · Product and documentation language: English

## 1. Problem

Developers accumulate reusable prompts (code review, refactoring, test
generation, incident write-ups) in scattered notes, chats and bookmarks. When
they need one, they hunt for it, copy it, and manually fill placeholders. Most
prompt tools are SaaS products — accounts, network calls and vendor lock-in for
what is fundamentally a text file.

## 2. Target audience

- Primary: software developers who reuse prompts in coding tasks, on Windows,
  Linux or macOS.
- Secondary: any technically comfortable user who keeps prompts as Markdown.

Assumptions: comfortable with a terminal; wants plain files they own; single
user per vault (no multi-user concerns in the MVP).

## 3. Value proposition

Find a prompt, fill its variables, reuse it — locally, offline, without an
account or API. The vault is a folder of Markdown files: the files are the
source of truth and remain usable with any editor.

## 4. Scope (MVP)

Seven commands and one global option:

| Command | Purpose |
|---|---|
| `promptvault init` | create the vault skeleton (idempotent) |
| `promptvault add <id> --title <t> --file <path> [--tags <csv>]` | add a prompt |
| `promptvault list [--tag <tag>] [--json]` | list prompts |
| `promptvault show <id>` | print a prompt body |
| `promptvault search <query> [--tag <tag>] [--json]` | search id/title/tags/body |
| `promptvault render <id> [--var k=v ...] [--copy]` | substitute variables; optional clipboard copy |
| `promptvault doctor` | inspect vault health (read-only) |

Global: `--vault <path>`.

Explicitly out of scope (non-goals):

- SaaS, accounts, sync, cloud storage; any network activity.
- Database, persistent index, fuzzy ranking, ML.
- Editing, deleting, or syncing prompts; auto-update.
- Executing prompts or template logic beyond `{{name}}` substitution.
- Interactive prompts, TUI, GUI.
- Plugins, DI framework, event bus, monorepo.
- Encryption — "Vault" is only a name; files are plain UTF-8 text.
- Telemetry of any kind.
- Automatic vault discovery in parent directories; `~` expansion.

## 5. Domain rules (summary)

Full normative detail in `docs/ARCHITECTURE.md`. Summary:

- Vault layout: `<vault>/prompts/<id>.md` only. No `config.json` in the MVP.
- Prompt file: YAML front matter between `---` delimiter lines, then the body.
- `schemaVersion`: exactly the number `1`.
- `id`: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 80 chars; must equal the file name.
- `title`: required, non-empty after trim, single line, max 120 chars.
- `tags`: optional (default `[]`), max 20, same slug format; deduplicated and
  sorted on creation.
- Unknown front-matter properties are rejected (strict schema).
- Body: non-empty (at least one non-whitespace character), kept verbatim apart
  from canonical LF line endings; UTF-8.
- Whole file: max 1 MiB of UTF-8 bytes; BOM accepted on read, never written.
- Symlinks are rejected in `prompts/` and for prompt files; the tool never
  writes outside the resolved `prompts/` directory; existing prompts are never
  overwritten (exclusive creation).
- Variables: `{{name}}`, name `[A-Za-z_][A-Za-z0-9_]*`, literal global
  single-pass substitution; missing, duplicate and unused variables are errors.

## 6. Acceptance criteria (MVP)

Testable statements; each maps to tests in later stages.

Initialization

- [ ] `init` creates `<vault>/prompts/`, is idempotent, installs no examples
  and no config file.

Adding prompts

- [ ] `add` requires an initialized vault; writes front matter + body as UTF-8
  with LF endings.
- [ ] `add` fails (exit 2) when `<id>.md` already exists.
- [ ] `add` normalizes `--tags` (trim, validate, dedupe, sort) and rejects
  invalid or empty items (exit 2).
- [ ] Body comes from `--file` only; no metadata is imported from it.

Reading

- [ ] `list` and `search` have deterministic order by `id`; `--json` emits pure
  JSON; an empty result is no lines (human) or `[]` (JSON), exit 0.
- [ ] `show <id>` prints only the body, as stored.
- [ ] `search` matches case-insensitively in id, title, tags and body.
- [ ] Any invalid prompt file makes `list`/`search` fail (exit 2) with no
  partial output.
- [ ] Missing or malformed prompt id in `show`/`render` → exit 3.

Rendering

- [ ] `render` substitutes all variables; missing, duplicated or unused
  `--var` keys are errors (exit 2) with nothing on stdout.
- [ ] `render --copy` copies only after a successful render; on clipboard
  failure: exit 1, error on stderr, nothing on stdout.

Health

- [ ] `doctor` inspects every file, reports problems, changes nothing; exit 2
  when problems are found, 0 when clean.

Cross-cutting

- [ ] stdout carries requested data only; operational messages and errors go to
  stderr.
- [ ] No ANSI or terminal control sequences are emitted; the escaping policy
  applies to all human and JSON output.
- [ ] Same behavior on Windows, Linux and macOS; no shell dependencies.
- [ ] No network calls at runtime.

## 7. Success metrics

No telemetry by design, so success is qualitative:

- A user can go from "I need that prompt" to "copied with variables filled" in
  under a minute.
- The vault survives external edits: any editor can add or fix a prompt file
  and `doctor`/`list` still work or explain exactly what is wrong.

## 8. Risks (product level)

| Risk | Mitigation |
|---|---|
| Scope creep beyond the seven commands | AGENTS.md stage discipline, ROADMAP gates |
| Vault files broken by third-party edits | strict validation, `doctor`, explicit errors |
| YAML edge cases (aliases, multi-doc, custom tags) | restricted parser configuration + tests |
| Clipboard unavailable (headless/SSH) | `--copy` failure is explicit, never silent |
| Windows console encoding issues | UTF-8 output, escaping policy, no ANSI |
| Strictness annoys users (e.g. stray files in `prompts/`) | documented contract; revisit with feedback (see DECISIONS.md D7) |
