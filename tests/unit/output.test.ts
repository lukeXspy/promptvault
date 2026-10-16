import { describe, expect, it } from "vitest";
import {
  formatDoctorReport,
  formatPromptRows,
} from "../../src/shared/output.js";

const rows = [
  {
    id: "code-review",
    title: "Review a code change",
    tags: ["development", "review"],
  },
];

describe("formatPromptRows", () => {
  it("formats human lines as <id>TAB<title> with a trailing newline", () => {
    expect(formatPromptRows(rows, false)).toBe(
      "code-review\tReview a code change\n",
    );
  });

  it("formats an empty human list as no bytes", () => {
    expect(formatPromptRows([], false)).toBe("");
  });

  it("formats JSON with fixed key order and a trailing newline", () => {
    const output = formatPromptRows(rows, true);
    expect(output.endsWith("\n")).toBe(true);
    expect(JSON.parse(output)).toEqual(rows);
    expect(output.indexOf('"id"')).toBeLessThan(output.indexOf('"title"'));
    expect(output.indexOf('"title"')).toBeLessThan(output.indexOf('"tags"'));
  });

  it("formats an empty JSON list as []", () => {
    expect(formatPromptRows([], true)).toBe("[]\n");
  });

  it("escapes control characters in both modes (D15, D44)", () => {
    const evil = [{ id: "evil", title: "a\u001b[31mb\tc", tags: [] }];

    const human = formatPromptRows(evil, false);
    expect(human).not.toMatch(/\u001b/);
    expect(human).toBe("evil\ta\\u001b[31mb\tc\n");

    const json = formatPromptRows(evil, true);
    expect(json).not.toMatch(/\u001b/);
    expect(JSON.parse(json)).toEqual([
      { id: "evil", title: "a\\u001b[31mb\tc", tags: [] },
    ]);
  });
});

describe("formatDoctorReport", () => {
  it("formats a clean vault with aligned labels and a summary", () => {
    expect(
      formatDoctorReport({
        vaultPath: "C:\\vault",
        files: [{ name: "alpha.md" }, { name: "zulu.md" }],
      }),
    ).toBe(
      "vault: C:\\vault\n" +
        "prompts: 2 file(s)\n" +
        "OK     alpha.md\n" +
        "OK     zulu.md\n" +
        "summary: 2 ok, 0 error\n",
    );
  });

  it("formats problems with the invariant summary wording", () => {
    expect(
      formatDoctorReport({
        vaultPath: "/v",
        files: [
          { name: "broken.md", problem: "bad" },
          { name: "good.md" },
          { name: "other.md", problem: "worse" },
        ],
      }),
    ).toBe(
      "vault: /v\n" +
        "prompts: 3 file(s)\n" +
        "ERROR  broken.md: bad\n" +
        "OK     good.md\n" +
        "ERROR  other.md: worse\n" +
        "summary: 1 ok, 2 error\n",
    );
  });

  it("reports an uninitialized vault as one problem (no prompts line)", () => {
    expect(formatDoctorReport({ vaultPath: "/v", files: null })).toBe(
      "vault: /v\n" +
        'ERROR  vault not initialized; run "promptvault init"\n' +
        "summary: 0 ok, 1 error\n",
    );
  });

  it("handles an empty prompts directory as a clean report", () => {
    expect(formatDoctorReport({ vaultPath: "/v", files: [] })).toBe(
      "vault: /v\nprompts: 0 file(s)\nsummary: 0 ok, 0 error\n",
    );
  });

  it("escapes the vault path, names and problems (D15)", () => {
    const output = formatDoctorReport({
      vaultPath: "v\u0007",
      files: [{ name: "a\u001b.md", problem: "b\tc\u007f" }],
    });

    expect(output).not.toMatch(/[\u0007\u001b\u007f]/);
    expect(output).toBe(
      "vault: v\\u0007\n" +
        "prompts: 1 file(s)\n" +
        "ERROR  a\\u001b.md: b\tc\\u007f\n" +
        "summary: 0 ok, 1 error\n",
    );
  });
});
