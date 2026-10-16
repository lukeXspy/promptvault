# PromptVault — CLI Specification (MVP)

Contract for `promptvault`, schemaVersion 1. Behavior here is normative.

## 1. Conventions

- Binary: `promptvault`.
- Usage: `promptvault [--vault <path>] <command> [options]`.
- Global option: `--vault <path>` — vault root. Accepted before or after the
  subcommand (see DECISIONS.md D18).
- stdout: requested data only. stderr: messages and errors, prefixed
  `promptvault: ` and `promptvault: error: `.
- No ANSI colors or control sequences; the escaping policy of ARCHITECTURE
  § 8 applies to every output.
- No interactive prompts; commands never read from stdin.
- `--help` / `-h` and `--version`: print to stdout, exit 0.
- Unknown command/option, missing required option, invalid option value:
  message to stderr, exit 2.
- Running with no subcommand: usage message to stderr, exit 2.

## 2. Vault resolution

1. `--vault <path>`
2. `PROMPTVAULT_HOME`
3. `<user home>/.promptvault`

Relative paths resolve from the current working directory; an empty
`PROMPTVAULT_HOME` is treated as unset; `~` is not expanded (pass absolute
paths). No discovery of vaults in parent directories.

## 3. Exit codes

| Code | Meaning | Examples |
|---|---|---|
| 0 | success | command completed; empty results are success |
| 1 | unexpected failure, I/O or clipboard | unreadable file, clipboard unavailable |
| 2 | invalid usage or data; missing variable; creation conflict | bad flag; unknown front-matter property; `add` for an existing id |
| 3 | prompt not found | `show missing-id`; also an id in invalid format |

## 4. Shared output shapes

Human list/search line: `<id>` + TAB + `<title>` (one per line, sorted by id).

JSON (list/search): array sorted by id, pretty-printed with 2 spaces, trailing
newline:

```json
[
  {
    "id": "code-review",
    "title": "Review a code change",
    "tags": ["development", "review"]
  }
]
```

Empty result: human → no output at all; JSON → `[]`. Exit 0, no stderr
chatter.

## 5. Commands

### 5.1 init

Synopsis: `promptvault init`

- Creates `<vault>/prompts/` (recursively). Idempotent: if the vault is
  already initialized, it succeeds without changes.
- Installs no examples and creates no config file.
- Messages go to stderr only; stdout stays empty.
- Errors: vault path blocked by an existing file, a symlinked `prompts/`
  directory (rejected), or permission denied → exit 1 (I/O).

Example:

```
$ promptvault init
promptvault: vault initialized at C:\Users\me\.promptvault
$ echo $?
0
```

### 5.2 add

Synopsis: `promptvault add <id> --title <title> --file <path> [--tags <csv>]`

- `<id>`: slug (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), max 80 chars.
- `--title`: required; trimmed non-empty, single line, max 120 chars.
- `--file`: required; the file's content is the body. Max 1 MiB, valid UTF-8,
  BOM stripped, CRLF normalized to LF. The file is body only — no metadata is
  imported from it.
- `--tags`: optional CSV. Items are trimmed; an invalid or empty item → exit
  2. Max 20; deduplicated; sorted ordinally.
- The vault must be initialized (`prompts/` exists); otherwise exit 2 with a
  hint to run `promptvault init`.
- Writes `<vault>/prompts/<id>.md` as UTF-8 with LF, using exclusive creation.
- If `<id>.md` already exists → exit 2 (creation conflict).
- Success message on stderr; stdout stays empty.

Example:

```
$ promptvault add code-review --title "Review a code change" --file review.md --tags "review, development"
promptvault: added prompt "code-review"
$ echo $?
0
```

### 5.3 list

Synopsis: `promptvault list [--tag <tag>] [--json]`

- Reads every entry in `prompts/` and validates ALL files before printing
  anything (no partial output).
- `--tag`: exact match against stored tags; the value must be a valid slug,
  otherwise exit 2.
- Order: by `id` (ordinal). Output: human lines or JSON array.
- Any invalid file, symlink, subdirectory or stray entry → error naming the
  file(s), exit 2.
- Empty vault or no match → no output / `[]`, exit 0.

Examples:

```
$ promptvault list
code-review	Review a code change
refactor-legacy	Refactor legacy module
$ promptvault list --tag review --json
[
  {
    "id": "code-review",
    "title": "Review a code change",
    "tags": ["development", "review"]
  }
]
```

### 5.4 show

Synopsis: `promptvault show <id>`

- Loads the addressed prompt only; that file must be valid, otherwise exit 2.
- Prints only the body, exactly as stored (LF canonical; no added trailing
  newline, no extra text on stdout).
- File missing, or `<id>` not in a valid format → exit 3.

Example:

```
$ promptvault show code-review
Review the following {{language}} code.
```

### 5.5 search

Synopsis: `promptvault search <query> [--tag <tag>] [--json]`

- `<query>`: required, non-empty; a literal substring (no wildcards, no
  tokenization; a multi-word query is one substring).
- Matching is case-insensitive (Unicode `toLowerCase`) against id, title, any
  single tag, and body.
- `--tag` filters like in `list` (combined with the query).
- Same vault validation, ordering and output shapes as `list`.
- No results → no output / `[]`, exit 0.

Example:

```
$ promptvault search security
code-review	Review a code change
```

### 5.6 render

Synopsis: `promptvault render <id> [--var <key=value>]... [--copy]`

- Loads the prompt (single file; must be valid; not found → exit 3).
- Each `--var` splits on the FIRST `=`; the key must match
  `[A-Za-z_][A-Za-z0-9_]*`; the value may contain `=` and may be empty;
  duplicate keys → exit 2.
- Tokens `{{name}}` are extracted from the body; missing values or unused
  values → exit 2, nothing on stdout. Values are never echoed in messages.
- Substitution is literal, global and single-pass (inserted text is never
  re-interpreted as a template).
- Output: the rendered body as text only.
- `--copy`: render and validate in memory first; then copy to the clipboard;
  only after a successful copy print the rendered body to stdout and the
  confirmation `copied to clipboard` to stderr. Clipboard failure → exit 1, error on stderr,
  nothing on stdout, no success claim.

Examples:

```
$ promptvault render code-review --var language=TypeScript
promptvault: error: missing variables: code
$ echo $?
2
```

```
$ promptvault render code-review --var language=TypeScript --var code="print('hi')"
...rendered body on stdout...
```

Note: `render` has no file indirection syntax in the MVP — values are passed
literally on the command line.

### 5.7 doctor

Synopsis: `promptvault doctor`

- Read-only. Resolves the vault and inspects every entry in `prompts/`
  (the same scan `list`/`search` use, D50).
- Report goes to stdout: `vault: <path>`, `prompts: <n> file(s)`, one line
  per entry in scan order — `OK     <name>` or `ERROR  <name>: <reason>`
  (label padded to 7 columns) — then `summary: <n> ok, <m> error`
  (invariant wording). An uninitialized vault is reported as the single
  problem line `ERROR  vault not initialized; run "promptvault init"`
  (no `prompts:` line).
- Exit: 0 clean; 2 when problems are found; 1 when nothing could be read.
- Never modifies anything and never prints bodies; names and reasons are
  escaped per ARCHITECTURE § 8.

Example:

```
$ promptvault doctor
vault: C:\Users\me\.promptvault
prompts: 12 file(s)
OK     code-review.md
ERROR  broken.md: missing front matter: the file must start with a '---' line
summary: 11 ok, 1 error
$ echo $?
2
```

## 6. Error message catalog (representative; wording may evolve)

- `promptvault: error: vault not initialized at <path>; run "promptvault init"`
- `promptvault: error: vault path is a symbolic link, refusing to use it: <path>`
- `promptvault: error: prompt not found: <id>`
- `promptvault: error: empty search query`
- `promptvault: error: prompt already exists: <id>`
- `promptvault: error: invalid id "<id>": must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ and be at most 80 characters`
- `promptvault: error: invalid tag "<value>": must match ^[a-z0-9]+(?:-[a-z0-9]+)*$`
- `promptvault: error: invalid title: must be non-empty, single line, at most 120 characters`
- `promptvault: error: invalid --var: expected key=value`
- `promptvault: error: invalid --var key "<key>"`
- `promptvault: error: missing variables: <names>`
- `promptvault: error: unused variables: <names>`
- `promptvault: error: duplicate --var key: <name>`
- `promptvault: error: invalid prompt file <name>: <reason>` (list/search join
  multiple findings with `; `)
- `promptvault: error: clipboard unavailable: <system message>`

Tests pin behavior primarily by exit code, stdout/stderr split and message
prefix; update this catalog whenever wording changes.

## 7. Walkthrough

```
$ promptvault init
$ promptvault add code-review --title "Review a code change" --file review.md --tags "review,development"
$ promptvault list
$ promptvault search review --json
$ promptvault render code-review --var language=TypeScript
$ promptvault render code-review --var language=TypeScript --copy
$ promptvault doctor
```
