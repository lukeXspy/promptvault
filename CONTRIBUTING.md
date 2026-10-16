# Contributing to PromptVault

Thanks for helping. PromptVault is a small, local-first CLI; the MVP scope is
defined by [docs/PRD.md](docs/PRD.md) and
[docs/CLI_SPEC.md](docs/CLI_SPEC.md), and the working rules for contributors
and agents are in [AGENTS.md](AGENTS.md).

## Setup

Node.js 24 or newer and npm.

    npm ci
    npm run build

## Quality gates

Run all five before proposing a change; the CI workflow
(`.github/workflows/ci.yml`) is configured to run the same list.

| Gate | Command |
|---|---|
| Format | `npm run format:check` (use `npm run format` to fix) |
| Lint | `npm run lint` |
| Types | `npm run typecheck` |
| Tests | `npm test` |
| Build | `npm run build` |

The built CLI lives at `dist/cli/main.js` (`npm run dev -- <args>` runs the
TypeScript sources directly through `tsx`).

## Tests

- Unit tests live in `tests/unit/`, CLI integration tests in
  `tests/integration/`, shared helpers in `tests/helpers/`.
- Integration tests spawn the real CLI through `tests/helpers/run-cli.ts`,
  which always overrides `PROMPTVAULT_HOME` with a throwaway directory. Every
  test must use its own temp vault (`makeTempDir` plus `--vault`) — never a
  real user vault, and never the machine's default `~/.promptvault`.
- Prefer the real filesystem under `os.tmpdir()` over mocks. The OS clipboard
  is the single mocked border (unit tests); integration tests never pass
  `--copy`.
- Add a regression test with every bug fix.
- Fixtures must be synthetic: no personal data, no real vaults, no secrets
  (see [SECURITY.md](SECURITY.md)).

## Changing the contract

- Read the docs first; [docs/CLI_SPEC.md](docs/CLI_SPEC.md) is normative.
- A behavior change is not complete until the tests, the spec
  (`docs/CLI_SPEC.md`; `docs/ARCHITECTURE.md` where relevant) and the error
  catalog are updated in the same change, with reasoning recorded in
  [docs/DECISIONS.md](docs/DECISIONS.md).
- Do not add commands, flags or output formats that are not in the spec
  without first updating the spec.

## Dependencies

- The approved stack is fixed in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
  §10. A new dependency needs justification, considered alternatives and
  explicit maintainer approval in the task or tracking issue.
- Verify real versions with `npm view <pkg> version` before adding one; never
  invent a version.
- PromptVault makes no network calls at runtime and ships no telemetry; pull
  requests that add either are out of scope.

## Scope

Welcome: bug reports with minimal reproductions, regression tests,
documentation fixes, platform verification (the CI matrix runs Ubuntu, macOS
and Windows on Node.js 24 and is green — see
https://github.com/lukeXspy/promptvault/actions/runs/38943882635), and fixes
that make existing documented behavior hold.

Out of scope without prior discussion: features beyond `docs/PRD.md`,
executing prompt content (never), and packaging/publishing changes.

## Packaging smoke test

`scripts/smoke-pack.mjs` builds the project, packs the tarball, installs it
into a throwaway project and exercises the installed CLI end to end (no
clipboard, no real vault). Run it from the repository root:

    npm run smoke:pack

It needs registry access to install the runtime dependencies and is not part
of CI yet.
