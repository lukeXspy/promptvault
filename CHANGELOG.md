# Changelog

All notable changes to PromptVault are documented in this file.

Nothing has been published or tagged yet, so there are no releases; the
entries below describe the unreleased MVP (current package version: 0.1.0).

## [Unreleased]

### Added

- `init` — create the vault (`prompts/` only; idempotent).
- `add <id> --title <title> --file <path> [--tags <csv>]` — store a prompt
  with exclusive creation and canonical UTF-8/LF output.
- `list [--tag <tag>] [--json]` and `search <query> [--tag <tag>] [--json]` —
  ordinal ordering, all-or-nothing validation, control-character-safe output.
- `show <id>` — byte-exact body output.
- `render <id> [--var <key=value>]... [--copy]` — single-pass literal
  `{{name}}` substitution; clipboard copy with explicit failure handling.
- `doctor` — read-only per-file `OK`/`ERROR` report (exit 0/2/1).
- Documentation set: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, issue and
  pull request templates, and the specs under `docs/`.
- CI workflow for Windows/Linux/macOS (Node.js 24) and a packaging smoke
  script (`npm run smoke:pack`). The workflow executed on GitHub: the first
  run failed only on Windows (a test expectation about canonical paths); a
  test-only fix followed, and subsequent runs passed on all three platforms
  — see
  https://github.com/lukeXspy/promptvault/actions/runs/38943882635.
- MIT license: `LICENSE` file with the confirmed copyright line
  (`Copyright (c) 2026 Lucas Enzo Marcon`) and the SPDX field in
  `package.json`.

### Pending before the first release

- `examples/` sample prompts (listed in the Stage 11 checklist; not created
  yet).
