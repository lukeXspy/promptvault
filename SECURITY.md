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

Report suspected vulnerabilities through GitHub Private Vulnerability
Reporting: open the **Security** tab of the repository and use the
**Report a vulnerability** button, or go directly to
<https://github.com/lukeXspy/promptvault/security/advisories/new> (a GitHub
account is required). Do not disclose the issue in public before it has been
addressed.

A minimal report is enough:

- a short description of the issue and its impact;
- reproduction steps — what you ran (exact command, stdout, stderr, exit
  code) and what you expected instead;
- the affected PromptVault version or commit, your operating system and
  Node.js version.

Never include secrets, tokens, contents of personal vaults or personal data
in the report or in any public issue.
