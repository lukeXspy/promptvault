#!/usr/bin/env node
/**
 * Packaging smoke test (Stage 11): builds the project, packs the npm tarball,
 * installs it into a throwaway project outside the repository and exercises
 * the installed CLI end to end.
 *
 * Safety properties:
 * - never touches the real clipboard (`render --copy` is not used, and the
 *   `add` clipboard check only exercises the conflicting-sources path, which
 *   must fail before any clipboard access);
 * - never reads or writes a real vault: `PROMPTVAULT_HOME` and `--vault`
 *   always point into the smoke's own temp directory;
 * - runs the CLI from a temporary working directory, not the repository.
 *
 * The install needs registry access for the runtime dependencies. Run from
 * the repository root:
 *
 *   npm run smoke:pack
 *   node scripts/smoke-pack.mjs
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

let passed = 0;
const failures = [];

function expect(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}\n      ${detail}`);
  }
}

function runProcess(command, args, options) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

/** Locates the npm CLI script without relying on shell shims. */
function npmInvocation() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv !== undefined && fromEnv.endsWith(".js") && existsSync(fromEnv)) {
    return { command: process.execPath, args: [fromEnv] };
  }
  const bundled = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (existsSync(bundled)) {
    return { command: process.execPath, args: [bundled] };
  }
  return null;
}

function runNpm(args, cwd) {
  const npm = npmInvocation();
  if (npm !== null) {
    return runProcess(npm.command, [...npm.args, ...args], { cwd });
  }
  // Last resort: the npm shim on PATH. Exact args matter here, so none of
  // the calls below may contain characters that need shell quoting.
  const shim = process.platform === "win32" ? "npm.cmd" : "npm";
  return runProcess(shim, args, { cwd, shell: true });
}

function setupFailure(step, result) {
  return new Error(
    `${step} failed (exit ${result.status})\n` +
      `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
  );
}

const tempRoot = mkdtempSync(path.join(tmpdir(), "promptvault-smoke-"));
let keepTemp = true;

try {
  const build = runNpm(["run", "build"], repoRoot);
  if (build.status !== 0) {
    throw setupFailure("npm run build", build);
  }

  const packageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  console.log(
    `# smoke: ${packageJson.name}@${packageJson.version} -> pack, install, exercise`,
  );

  const pack = runNpm(["pack", "--pack-destination", tempRoot], repoRoot);
  if (pack.status !== 0) {
    throw setupFailure("npm pack", pack);
  }
  const tarball = path.join(
    tempRoot,
    `${packageJson.name}-${packageJson.version}.tgz`,
  );
  if (!existsSync(tarball)) {
    throw new Error(`npm pack did not produce ${path.basename(tarball)}`);
  }
  console.log(`# tarball: ${tarball}`);

  const appDir = path.join(tempRoot, "app");
  mkdirSync(appDir);
  writeFileSync(
    path.join(appDir, "package.json"),
    `${JSON.stringify(
      { name: "promptvault-smoke-app", version: "0.0.0", private: true },
      null,
      2,
    )}\n`,
  );

  const install = runNpm(
    ["install", tarball, "--no-audit", "--no-fund", "--prefer-offline"],
    appDir,
  );
  if (install.status !== 0) {
    throw setupFailure("npm install (tarball)", install);
  }

  const installedDir = path.join(appDir, "node_modules", "promptvault");
  const installedMain = path.join(installedDir, "dist", "cli", "main.js");
  const installedPkg = JSON.parse(
    readFileSync(path.join(installedDir, "package.json"), "utf8"),
  );
  expect(
    "installed package exposes dist/cli/main.js",
    existsSync(installedMain),
    `missing ${installedMain}`,
  );
  expect(
    "installed version matches the packed version",
    installedPkg.version === packageJson.version,
    `${installedPkg.version} !== ${packageJson.version}`,
  );
  expect(
    "installed manifest carries the repository license and private metadata",
    installedPkg.license === packageJson.license &&
      installedPkg.private === true,
    JSON.stringify({
      license: installedPkg.license,
      private: installedPkg.private,
    }),
  );
  console.log(
    `# installed manifest: license=${installedPkg.license} private=${installedPkg.private}`,
  );

  // A scratch cwd and a throwaway PROMPTVAULT_HOME prove the CLI runs
  // outside the repository and never reaches a real vault.
  const scratch = path.join(tempRoot, "cwd");
  mkdirSync(scratch);
  const vault = path.join(tempRoot, "vault");
  const env = { ...process.env, PROMPTVAULT_HOME: path.join(tempRoot, "home") };

  const cli = (args) => {
    const result = runProcess(process.execPath, [installedMain, ...args], {
      cwd: scratch,
      env,
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };

  const help = cli(["--help"]);
  expect(
    "--help exits 0 with usage on stdout and no stderr",
    help.status === 0 &&
      help.stdout.includes("Usage: promptvault") &&
      help.stderr === "",
    JSON.stringify(help),
  );

  const version = cli(["--version"]);
  expect(
    "--version exits 0 with only the version on stdout",
    version.status === 0 &&
      version.stdout === `${installedPkg.version}\n` &&
      version.stderr === "",
    JSON.stringify(version),
  );

  const init = cli(["init", "--vault", vault]);
  expect(
    "init exits 0 and reports the vault on stderr only",
    init.status === 0 &&
      init.stdout === "" &&
      init.stderr === `promptvault: vault initialized at ${vault}\n`,
    JSON.stringify(init),
  );

  const bodySource = path.join(tempRoot, "body.md");
  writeFileSync(bodySource, "Review {{language}} code.\nPair it with tests.\n");
  const bodyBefore = readFileSync(bodySource);
  const add = cli([
    "add",
    "code-review",
    "--title",
    "  Review a code change  ",
    "--file",
    bodySource,
    "--tags",
    "review, development",
    "--vault",
    vault,
  ]);
  expect(
    "add exits 0 and reports the id on stderr only",
    add.status === 0 &&
      add.stdout === "" &&
      add.stderr === 'promptvault: added prompt "code-review"\n',
    JSON.stringify(add),
  );
  expect(
    "add leaves the source body file byte-identical",
    readFileSync(bodySource).equals(bodyBefore),
    "source bytes changed",
  );
  expect(
    "add wrote prompts/code-review.md",
    existsSync(path.join(vault, "prompts", "code-review.md")),
    "stored file missing",
  );

  const addHelp = cli(["add", "--help"]);
  expect(
    "add --help documents both body sources (--file and --clipboard)",
    addHelp.status === 0 &&
      addHelp.stdout.includes("--file <path>") &&
      addHelp.stdout.includes("--clipboard") &&
      addHelp.stderr === "",
    JSON.stringify(addHelp),
  );

  // The file path does not exist on purpose: a conflicting-sources error must
  // be reported without attempting to read the file (and before any
  // clipboard access), so this check never touches a real clipboard.
  const addConflict = cli([
    "add",
    "conflict-demo",
    "--title",
    "Conflict demo",
    "--file",
    path.join(tempRoot, "missing-body.md"),
    "--clipboard",
    "--vault",
    vault,
  ]);
  expect(
    "add rejects conflicting body sources before any read (exit 2)",
    addConflict.status === 2 &&
      addConflict.stdout === "" &&
      addConflict.stderr ===
        "promptvault: error: conflicting body sources: use --file <path> or --clipboard, not both\n",
    JSON.stringify(addConflict),
  );

  const list = cli(["list", "--vault", vault]);
  expect(
    "list exits 0 and prints '<id>\\t<title>'",
    list.status === 0 &&
      list.stdout === "code-review\tReview a code change\n" &&
      list.stderr === "",
    JSON.stringify(list),
  );

  const listJson = cli(["list", "--vault", vault, "--json"]);
  let listJsonParsed = null;
  try {
    listJsonParsed = JSON.parse(listJson.stdout);
  } catch {
    listJsonParsed = null;
  }
  expect(
    "list --json exits 0 with pure JSON and the expected shape",
    listJson.status === 0 &&
      listJson.stderr === "" &&
      listJsonParsed !== null &&
      JSON.stringify(listJsonParsed) ===
        JSON.stringify([
          {
            id: "code-review",
            title: "Review a code change",
            tags: ["development", "review"],
          },
        ]),
    JSON.stringify(listJson),
  );

  const show = cli(["show", "code-review", "--vault", vault]);
  expect(
    "show exits 0 and prints the stored body byte-exact",
    show.status === 0 &&
      show.stdout === "Review {{language}} code.\nPair it with tests.\n" &&
      show.stderr === "",
    JSON.stringify(show),
  );

  const search = cli(["search", "review", "--vault", vault]);
  expect(
    "search exits 0 and finds the prompt",
    search.status === 0 &&
      search.stdout === "code-review\tReview a code change\n" &&
      search.stderr === "",
    JSON.stringify(search),
  );

  const searchMiss = cli(["search", "zzz-no-match", "--vault", vault]);
  expect(
    "search with no match exits 0 with empty stdout",
    searchMiss.status === 0 &&
      searchMiss.stdout === "" &&
      searchMiss.stderr === "",
    JSON.stringify(searchMiss),
  );

  const render = cli([
    "render",
    "code-review",
    "--var",
    "language=TypeScript",
    "--vault",
    vault,
  ]);
  expect(
    "render substitutes variables",
    render.status === 0 &&
      render.stdout === "Review TypeScript code.\nPair it with tests.\n" &&
      render.stderr === "",
    JSON.stringify(render),
  );

  const renderMissing = cli([
    "render",
    "code-review",
    "--var",
    "other=1",
    "--vault",
    vault,
  ]);
  expect(
    "render fails with exit 2 when a variable is missing",
    renderMissing.status === 2 &&
      renderMissing.stdout === "" &&
      renderMissing.stderr ===
        "promptvault: error: missing variables: language\n",
    JSON.stringify(renderMissing),
  );

  const doctor = cli(["doctor", "--vault", vault]);
  const expectedDoctor =
    `vault: ${vault}\n` +
    "prompts: 1 file(s)\n" +
    "OK     code-review.md\n" +
    "summary: 1 ok, 0 error\n";
  expect(
    "doctor on a clean vault exits 0 with the OK report",
    doctor.status === 0 &&
      doctor.stdout === expectedDoctor &&
      doctor.stderr === "",
    JSON.stringify(doctor),
  );

  writeFileSync(path.join(vault, "prompts", "broken.md"), "no front matter\n");
  const doctorBad = cli(["doctor", "--vault", vault]);
  const expectedDoctorBad =
    `vault: ${vault}\n` +
    "prompts: 2 file(s)\n" +
    "ERROR  broken.md: missing front matter: the file must start with a '---' line\n" +
    "OK     code-review.md\n" +
    "summary: 1 ok, 1 error\n";
  expect(
    "doctor on a vault with an invalid entry exits 2 with the ERROR line",
    doctorBad.status === 2 &&
      doctorBad.stdout === expectedDoctorBad &&
      doctorBad.stderr === "",
    JSON.stringify(doctorBad),
  );
  rmSync(path.join(vault, "prompts", "broken.md"));

  const missing = cli(["show", "definitely-missing", "--vault", vault]);
  expect(
    "show of a missing id exits 3",
    missing.status === 3 &&
      missing.stdout === "" &&
      missing.stderr ===
        "promptvault: error: prompt not found: definitely-missing\n",
    JSON.stringify(missing),
  );

  const usage = cli(["list", "--bogus", "--vault", vault]);
  expect(
    "unknown option exits 2 with the promptvault prefix",
    usage.status === 2 &&
      usage.stdout === "" &&
      usage.stderr.startsWith("promptvault: error: unknown option '--bogus'"),
    JSON.stringify(usage),
  );

  const binDir = path.join(appDir, "node_modules", ".bin");
  if (process.platform === "win32") {
    const shim = path.join(binDir, "promptvault.cmd");
    const result = runProcess(
      process.env.ComSpec ?? "cmd.exe",
      ["/c", shim, "--version"],
      {
        cwd: scratch,
        env,
      },
    );
    expect(
      "the installed promptvault.cmd shim runs",
      result.status === 0 && result.stdout === `${installedPkg.version}\n`,
      JSON.stringify({
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    );
  } else {
    const shim = path.join(binDir, "promptvault");
    const result = runProcess(shim, ["--version"], { cwd: scratch, env });
    expect(
      "the installed promptvault bin shim runs",
      result.status === 0 && result.stdout === `${installedPkg.version}\n`,
      JSON.stringify({
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      }),
    );
  }

  if (failures.length === 0) {
    keepTemp = false;
    console.log(`\nsmoke: ${passed} checks passed, 0 failed`);
  } else {
    process.exitCode = 1;
    console.log(`\nsmoke: ${passed} checks passed, ${failures.length} failed`);
    console.log(`temp kept for inspection: ${tempRoot}`);
  }
} catch (error) {
  process.exitCode = 1;
  console.error(
    `smoke: setup failed\n${error instanceof Error ? error.message : String(error)}`,
  );
  console.log(`temp kept for inspection: ${tempRoot}`);
} finally {
  if (!keepTemp) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
