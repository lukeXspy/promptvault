/** Process exit codes shared by the CLI (docs/CLI_SPEC.md § 3). */
export const EXIT = {
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  NOT_FOUND: 3,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Domain error carrying the process exit code the CLI must use. */
export class PromptVaultError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = EXIT.FAILURE) {
    super(message);
    this.name = "PromptVaultError";
    this.exitCode = exitCode;
  }
}

/** Invalid usage or invalid data (exit 2). */
export class UsageError extends PromptVaultError {
  constructor(message: string) {
    super(message, EXIT.USAGE);
    this.name = "UsageError";
  }
}

/** Unexpected or I/O failure (exit 1). */
export class IoError extends PromptVaultError {
  constructor(message: string) {
    super(message, EXIT.FAILURE);
    this.name = "IoError";
  }
}

/** Invalid prompt data (exit 2). */
export class InvalidPromptError extends PromptVaultError {
  constructor(message: string) {
    super(message, EXIT.USAGE);
    this.name = "InvalidPromptError";
  }
}

/** Creation conflict: the target already exists (exit 2). */
export class CreationConflictError extends PromptVaultError {
  constructor(message: string) {
    super(message, EXIT.USAGE);
    this.name = "CreationConflictError";
  }
}

/** Prompt not found: missing file or malformed id (exit 3). */
export class PromptNotFoundError extends PromptVaultError {
  constructor(message: string) {
    super(message, EXIT.NOT_FOUND);
    this.name = "PromptNotFoundError";
  }
}
