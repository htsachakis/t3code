import { assert, describe, it } from "@effect/vitest";

import { resolveClaudeExecutable, type ResolveClaudeExecutableEnv } from "./claudeExecutable.ts";

const CMD_SHIM_CONTENTS = [
  "@ECHO off",
  "GOTO start",
  ":find_dp0",
  "SET dp0=%~dp0",
  "EXIT /b",
  ":start",
  "SETLOCAL",
  "CALL :find_dp0",
  '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*',
].join("\r\n");

const makeWindowsEnv = (
  overrides: Partial<ResolveClaudeExecutableEnv> = {},
): ResolveClaudeExecutableEnv => ({
  platform: "win32",
  pathDelimiter: ";",
  pathEnv: "",
  fileExists: () => false,
  readFile: () => undefined,
  ...overrides,
});

describe("resolveClaudeExecutable", () => {
  it("is a passthrough on non-Windows platforms", () => {
    assert.strictEqual(
      resolveClaudeExecutable("claude", { platform: "darwin" }),
      "claude",
    );
    assert.strictEqual(
      resolveClaudeExecutable("/usr/local/bin/claude", { platform: "linux" }),
      "/usr/local/bin/claude",
    );
  });

  it("returns absolute .exe paths unchanged on Windows", () => {
    const p = "C:\\Program Files\\claude\\claude.exe";
    assert.strictEqual(resolveClaudeExecutable(p, makeWindowsEnv()), p);
  });

  it("walks PATH and prefers a real .exe over a .cmd shim", () => {
    const pathEnv = "C:\\npm;C:\\scripts";
    const exe = "C:\\scripts\\claude.exe";
    const cmd = "C:\\npm\\claude.cmd";
    const env = makeWindowsEnv({
      pathEnv,
      fileExists: (p) => p === exe || p === cmd,
      readFile: () => CMD_SHIM_CONTENTS,
    });
    assert.strictEqual(resolveClaudeExecutable("claude", env), exe);
  });

  it("chases an npm .cmd shim on PATH to the underlying .exe", () => {
    const cmd = "C:\\npm\\claude.cmd";
    const exe = "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe";
    const env = makeWindowsEnv({
      pathEnv: "C:\\npm",
      fileExists: (p) => p === cmd || p === exe,
      readFile: (p) => (p === cmd ? CMD_SHIM_CONTENTS : undefined),
    });
    assert.strictEqual(resolveClaudeExecutable("claude", env), exe);
  });

  it("chases an explicit .cmd path to the underlying .exe", () => {
    const cmd = "C:\\npm\\claude.cmd";
    const exe = "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe";
    const env = makeWindowsEnv({
      fileExists: (p) => p === exe,
      readFile: (p) => (p === cmd ? CMD_SHIM_CONTENTS : undefined),
    });
    assert.strictEqual(resolveClaudeExecutable(cmd, env), exe);
  });

  it("falls back to the input when nothing on PATH resolves", () => {
    const env = makeWindowsEnv({
      pathEnv: "C:\\nope",
      fileExists: () => false,
    });
    assert.strictEqual(resolveClaudeExecutable("claude", env), "claude");
  });

  it("does not search PATH when the input contains a separator but no recognized extension", () => {
    const input = "C:\\custom\\wrapper";
    const env = makeWindowsEnv({
      pathEnv: "C:\\npm",
      fileExists: () => {
        throw new Error("should not probe PATH for path-like inputs");
      },
    });
    assert.strictEqual(resolveClaudeExecutable(input, env), input);
  });
});
