import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERSION } from "../../src/version.js";

describe("VERSION", () => {
  it("matches the package.json version", () => {
    const packageJsonPath = fileURLToPath(
      new URL("../../package.json", import.meta.url),
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version: string;
    };
    expect(VERSION).toBe(packageJson.version);
  });
});
