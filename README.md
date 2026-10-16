# PromptVault

PromptVault is a small, local-first CLI for reusable prompts. Each prompt is a
Markdown file with a compact front matter block; the "vault" is just a folder
of plain UTF-8 files. PromptVault adds, lists, shows, searches, renders
(`{{variables}}`) and copies prompts to the clipboard — fully offline, with no
account, database or telemetry. Prompt content is data: it is never executed.

Specifications live in [docs/](docs/):
[PRD](docs/PRD.md), [CLI_SPEC](docs/CLI_SPEC.md),
[ARCHITECTURE](docs/ARCHITECTURE.md), [ROADMAP](docs/ROADMAP.md),
[DECISIONS](docs/DECISIONS.md).

## Project status

- MVP complete against the documented contract: `init`, `add`, `list`, `show`,
  `search`, `render` (with `--copy`) and `doctor`.
- **Public repository**: https://github.com/lukeXspy/promptvault — the local
  Git history (branch `main`) is pushed there.
- **Not published**: no npm release and no tags; the package stays private
  (`private: true`). Installing from a local tarball (below) is the only
  supported distribution path for now.
- Verified locally on Windows with Node.js 24 (all five quality gates and the
  packaging smoke). The CI workflow in `.github/workflows/ci.yml` ran its
  first matrix on 2026-10-16: Ubuntu and macOS passed; the Windows job failed
  on a path-canonicalization assertion in one test. After a test-only fix,
  the follow-up run is green on all three platforms (Ubuntu, macOS,
  Windows):
  https://github.com/lukeXspy/promptvault/actions/runs/38943882635
- MIT licensed: `LICENSE` present with the confirmed copyright line
  (see [License](#license)).

## Requirements

- Node.js 24 or newer (`engines.node` is `>=24`).
- A desktop session only for clipboard operations (`render --copy`,
  `add --clipboard`).

## Development setup

    npm ci
    npm run build
    node dist/cli/main.js --help

Quality gates (all five; CI is configured to run the same list):

    npm run format:check
    npm run lint
    npm run typecheck
    npm test
    npm run build

## Install from a local tarball

The package is not on the npm registry yet. To use it from another project:

    # in this repository
    npm ci
    npm pack            # builds via "prepack", writes promptvault-<version>.tgz

    # in the consuming project
    npm install /path/to/promptvault-<version>.tgz
    ./node_modules/.bin/promptvault --help        # Linux/macOS
    node_modules\.bin\promptvault.cmd --help      # Windows

A registry-based install (`npm install -g promptvault`) will only be possible
after a release is published.

The repository also ships a packaging smoke test that builds, packs, installs
the tarball into a throwaway project and exercises the installed CLI
(no clipboard access, no real vault):

    npm run smoke:pack

## Usage

Examples below assume `promptvault` resolves to the binary installed above.
`--vault <path>` can be passed to every command to choose a vault explicitly.

    promptvault init
    promptvault add code-review --title "Review a code change" --file review.md --tags "review,development"
    promptvault add create-landing --title "Create a landing page" --clipboard
    promptvault list
    promptvault search review --json
    promptvault render code-review --var language=TypeScript
    promptvault show code-review
    promptvault doctor

This mirrors the walkthrough in [docs/CLI_SPEC.md](docs/CLI_SPEC.md) §7. The
steps not covered by the automated packaging smoke are `render --var ... --copy`
and a successful `add --clipboard`, which both require a real desktop
clipboard (the smoke only checks that `add` rejects conflicting sources before
any read).

### Commands at a glance

| Command | Purpose |
|---|---|
| `init` | Create `<vault>/prompts/`; idempotent |
| `add <id> --title <title> (--file <path> | --clipboard) [--tags <csv>]` | Add a prompt from a body file or the clipboard |
| `list [--tag <tag>] [--json]` | List prompts (`<id>` TAB `<title>`); validates all files first |
| `show <id>` | Print the stored body byte-exact |
| `search <query> [--tag <tag>] [--json]` | Case-insensitive literal substring search |
| `render <id> [--var <key=value>]... [--copy]` | Substitute variables; optionally copy to the clipboard |
| `doctor` | Read-only scan; per-file `OK`/`ERROR` report |

Exit codes: `0` success · `1` I/O or clipboard failure · `2` invalid usage or
data, missing variables, creation conflict · `3` prompt not found.

## Vault location

Resolution order ([docs/CLI_SPEC.md](docs/CLI_SPEC.md) §2):

1. `--vault <path>`
2. the `PROMPTVAULT_HOME` environment variable
3. `<user home>/.promptvault`

Relative paths resolve from the current working directory; `~` is not
expanded; there is no discovery of vaults in parent directories.

## Prompt file format

`add` writes `<vault>/prompts/<id>.md`:

    ---
    schemaVersion: 1
    id: code-review
    title: Review a code change
    tags:
      - development
      - review
    ---
    Review the following {{language}} code.

Rules:

- The file must start with a `---` line, followed by YAML front matter with
  exactly `schemaVersion: 1`, `id`, `title` and the optional `tags` list, then
  a closing `---` line and the body.
- `id`: slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 80 characters.
- `title`: trimmed, single line, at most 120 characters.
- `tags`: at most 20, each a slug; deduplicated and sorted. (This is what
  `add --tags` stores; you can also edit files by hand.)
- Body: stored verbatim (UTF-8, LF); at most 1 MiB per file. On read a leading
  UTF-8 BOM is stripped and CRLF is normalized to LF.
- The vault is strict: entries that do not match `<id>.md`, symlinks and
  subdirectories are reported by `doctor` and make `list`/`search` fail
  ([DECISIONS](docs/DECISIONS.md) D7).

## Variables

- A variable token is `{{name}}` (optional surrounding spaces). Names match
  `[A-Za-z_][A-Za-z0-9_]*`; anything else inside braces is literal text.
- Values come from repeated `--var key=value` flags. A pair splits on the
  first `=`; values may contain `=` and may be empty.
- Every variable used in the body must be provided, and every provided key
  must be used; duplicates are rejected. Violations exit 2 before printing
  anything.
- Substitution is literal and single-pass: a value containing `{{...}}` is
  never re-expanded.
- Variable values are never echoed in messages or error output.

## Plain text, not a secure vault

"Vault" is only a name: the files are plain UTF-8 Markdown. Anyone with access
to the folder (and any local process) can read them. There is no encryption,
no password and no protection. Do not store secrets in prompts.

## Clipboard notes

`render --copy` writes the rendered text to the OS clipboard and
`add --clipboard` reads the prompt body from it, both through the `clipboardy`
package. Clipboard access can fail in headless environments (then: exit 1 —
for `add`, nothing is created); the message is fixed (`clipboard unavailable:
cannot read from the clipboard` / `cannot write to the clipboard`) and never
repeats the system error or any content. `--clipboard` content passes through
the same canonicalization and limits as `--file` (UTF-8, BOM stripped,
CRLF → LF, max 1 MiB); an empty or whitespace-only clipboard is invalid data
(exit 2). The failure paths — and, for `add`, the full read flow — are covered
by unit tests with a mocked clipboard; the real `render --copy` call has been
exercised manually on Windows only. `clipboardy` is loaded only when a
clipboard operation actually runs.

## Known limitations

- Strict vault contents (see Prompt file format) — a documented tradeoff
  ([DECISIONS](docs/DECISIONS.md) D7).
- Windows reserved device names are not special-cased (D24).
- Search is one literal substring; no tokenization, ranking or query language
  (D5).
- Every command rescans the folder; there is no index or cache (D2).
- No `--json` for `doctor`; `show`/`render` read only the addressed file, so
  unrelated invalid files do not affect them.
- A crash mid-`add` can leave a partial file (never an overwritten one);
  `doctor` reports it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports:
[SECURITY.md](SECURITY.md). Changes are tracked in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Lucas Enzo Marcon;
`package.json` declares the SPDX identifier `MIT`.
