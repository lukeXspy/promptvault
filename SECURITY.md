# Security Policy

## Scope and design guarantees

PromptVault is a local-first CLI. The following properties are part of the
design and are covered by tests:

- No network calls at runtime, no telemetry, no accounts.
- Prompt content is data, never code: no `eval`, no shell, no template
  engine. The only transformation is the literal, single-pass `{{name}}`
  substitution described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §7.
- Prompt bodies and variable values are never written to logs or error
  messages; structured output escapes control characters
  ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §8), so vault data cannot
  inject ANSI/terminal control sequences.
- Filesystem access is limited to the resolved vault plus the explicit
  `--file` input; ids are validated before any path is built, and symlinks
  inside the vault are rejected.

## Known limitations (not vulnerabilities)

- **Not a secure vault.** The vault is plain UTF-8 text. Anyone with
  filesystem access can read or modify it: there is no encryption, no
  password and no protection against other local processes. Do not keep
  secrets in prompts.
- **Clipboard.** `render --copy` hands the rendered text to the OS clipboard;
  other local processes may read it, as with any clipboard use.
- **Concurrency.** There is no locking. `add` never overwrites (exclusive
  create), but two concurrent writes or a crash can leave a partial file,
  which `doctor` reports.

## Reporting a vulnerability

No private reporting channel exists yet. Until one does, do not disclose
anything about the suspected vulnerability in public.

- Open a public issue only to **request a private contact channel**. That
  request must not contain technical details, exploit proof-of-concepts,
  secrets, tokens, vault contents, variable values or any personal data.
- A maintainer then arranges a private way to exchange the details.

No email address or URL exists for this yet; do not assume one. Once the
project has a public repository, GitHub Private Vulnerability Reporting is
the intended channel — it is **not enabled** and remains a pending release
item (see [docs/ROADMAP.md](docs/ROADMAP.md) and DECISIONS Q11).

When the details are shared privately, a minimal synthetic example is enough:

- what you ran (exact command, stdout, stderr, exit code) and what happened;
- what you expected instead;
- OS, Node.js version and PromptVault version/commit.
