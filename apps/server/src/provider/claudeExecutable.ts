import * as fs from "node:fs";
import * as path from "node:path";

export interface ResolveClaudeExecutableEnv {
  readonly platform?: NodeJS.Platform;
  readonly pathEnv?: string;
  readonly pathDelimiter?: string;
  readonly fileExists?: (filePath: string) => boolean;
  readonly readFile?: (filePath: string) => string | undefined;
}

// Extensions Windows spawn() can execute directly (no shell needed).
const DIRECTLY_EXECUTABLE_EXTENSIONS = new Set([".exe", ".com"]);
// Extensions that require a shell to spawn — npm creates these as PATH shims.
const SHIM_EXTENSIONS = new Set([".cmd", ".bat"]);

// Resolve a Claude Code binary to one the Claude Agent SDK can spawn without
// `shell: true`. The SDK classifies anything without a `.js/.mjs/.ts/.tsx/.jsx`
// extension as a native binary and hands it to child_process.spawn directly.
// On Windows that can't resolve PATH shims like `claude.cmd`, so we chase the
// shim to its underlying `.exe` here and hand that to the SDK.
//
// Non-Windows platforms are passthrough.
export function resolveClaudeExecutable(
  binaryPath: string,
  env: ResolveClaudeExecutableEnv = {},
): string {
  const platform = env.platform ?? process.platform;
  if (platform !== "win32") return binaryPath;

  const fileExists = env.fileExists ?? defaultFileExists;
  const readFile = env.readFile ?? defaultReadFile;
  const pathEnv = env.pathEnv ?? process.env.PATH ?? "";
  const delimiter = env.pathDelimiter ?? path.delimiter;

  const ext = path.extname(binaryPath).toLowerCase();
  if (DIRECTLY_EXECUTABLE_EXTENSIONS.has(ext)) return binaryPath;

  if (SHIM_EXTENSIONS.has(ext)) {
    const exe = resolveShimTarget(binaryPath, readFile, fileExists);
    return exe ?? binaryPath;
  }

  const hasSeparator = binaryPath.includes("\\") || binaryPath.includes("/");
  if (hasSeparator) return binaryPath;

  const found = findOnPath(binaryPath, pathEnv, delimiter, fileExists, readFile);
  return found ?? binaryPath;
}

function findOnPath(
  name: string,
  pathEnv: string,
  delimiter: string,
  fileExists: (filePath: string) => boolean,
  readFile: (filePath: string) => string | undefined,
): string | undefined {
  const entries = pathEnv.split(delimiter).filter((entry) => entry.length > 0);

  for (const dir of entries) {
    for (const ext of DIRECTLY_EXECUTABLE_EXTENSIONS) {
      const candidate = path.join(dir, `${name}${ext}`);
      if (fileExists(candidate)) return candidate;
    }
  }

  for (const dir of entries) {
    for (const ext of SHIM_EXTENSIONS) {
      const shim = path.join(dir, `${name}${ext}`);
      if (!fileExists(shim)) continue;
      const exe = resolveShimTarget(shim, readFile, fileExists);
      if (exe) return exe;
    }
  }

  return undefined;
}

// npm shims exec a sibling binary via `"%dp0%\<relative>.exe"`. Extract it.
const SHIM_EXE_REFERENCE = /"%dp0%[\\/]([^"]+?\.exe)"/i;

function resolveShimTarget(
  shimPath: string,
  readFile: (filePath: string) => string | undefined,
  fileExists: (filePath: string) => boolean,
): string | undefined {
  const contents = readFile(shimPath);
  if (contents) {
    const match = contents.match(SHIM_EXE_REFERENCE);
    if (match && match[1]) {
      const resolved = path.resolve(path.dirname(shimPath), match[1]);
      if (fileExists(resolved)) return resolved;
    }
  }
  return undefined;
}

function defaultFileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function defaultReadFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}
