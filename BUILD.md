# BUILD.md

## Prerequisites

| Tool | Required version |
| ---- | ---------------- |
| Bun  | `^1.3.11`        |
| Node | `^24.13.1`       |

Install dependencies:

```bash
bun install
```

## Project structure

| Package                   | Path                               | Description                                      |
| ------------------------- | ---------------------------------- | ------------------------------------------------ |
| `t3` (server)             | `apps/server`                      | Node.js WebSocket server, wraps Codex app-server |
| `@t3tools/web`            | `apps/web`                         | React/Vite UI                                    |
| `@t3tools/desktop`        | `apps/desktop`                     | Electron desktop shell                           |
| `@t3tools/marketing`      | `apps/marketing`                   | Astro marketing site                             |
| `@t3tools/contracts`      | `packages/contracts`               | Shared schemas and TypeScript contracts          |
| `@t3tools/shared`         | `packages/shared`                  | Shared runtime utilities                         |
| `@t3tools/client-runtime` | `packages/client-runtime`          | Client runtime                                   |
| `effect-acp`              | `packages/effect-acp`              | Effect ACP utilities                             |
| `effect-codex-app-server` | `packages/effect-codex-app-server` | Codex app-server Effect wrapper                  |

## Versioning

The app version is `0.0.20`, defined in `apps/server/package.json` under the `version` field.

The desktop build uses the server version by default. Override at build time with:

```bash
bun dist:desktop:win --build-version 0.1.0
```

Or via the `T3CODE_DESKTOP_VERSION` environment variable.

## Development

### Full stack (server + web)

```bash
bun dev
```

Default ports: server `13773`, web `5733`.

### Server only

```bash
bun dev:server
```

### Web only

```bash
bun dev:web
```

### Desktop (Electron)

```bash
bun dev:desktop
```

### Marketing site

```bash
bun dev:marketing
```

## Building

### Build everything

```bash
bun build
```

### Build desktop + server + web

```bash
bun build:desktop
```

Build artifacts go to:

| Package        | Output                                                       |
| -------------- | ------------------------------------------------------------ |
| `apps/desktop` | `apps/desktop/dist-electron/`                                |
| `apps/server`  | `apps/server/dist/`                                          |
| `apps/web`     | `apps/web/dist/` (also copied to `apps/server/dist/client/`) |

### Build marketing site

```bash
bun build:marketing
```

## Desktop distribution (Electron installers)

All installer commands output to the `release/` directory at the repo root.

### Windows (NSIS installer)

```bash
bun dist:desktop:win          # auto-detect arch
bun dist:desktop:win:x64      # x64 only
bun dist:desktop:win:arm64    # arm64 only
```

### macOS (DMG)

```bash
bun dist:desktop:dmg          # auto-detect arch
bun dist:desktop:dmg:arm64    # Apple Silicon
bun dist:desktop:dmg:x64      # Intel
```

### Linux (AppImage)

```bash
bun dist:desktop:linux
```

### Build script flags

```bash
node scripts/build-desktop-artifact.ts [flags]
```

| Flag              | Env var                       | Description                                          |
| ----------------- | ----------------------------- | ---------------------------------------------------- |
| `--platform`      | `T3CODE_DESKTOP_PLATFORM`     | `mac`, `linux`, or `win`                             |
| `--target`        | `T3CODE_DESKTOP_TARGET`       | e.g. `dmg`, `AppImage`, `nsis`                       |
| `--arch`          | `T3CODE_DESKTOP_ARCH`         | `arm64`, `x64`, or `universal`                       |
| `--build-version` | `T3CODE_DESKTOP_VERSION`      | Override app version                                 |
| `--output-dir`    | `T3CODE_DESKTOP_OUTPUT_DIR`   | Override output directory                            |
| `--skip-build`    | `T3CODE_DESKTOP_SKIP_BUILD`   | Reuse existing `dist/` artifacts                     |
| `--keep-stage`    | `T3CODE_DESKTOP_KEEP_STAGE`   | Keep temporary staging directory                     |
| `--signed`        | `T3CODE_DESKTOP_SIGNED`       | Enable code signing (Windows: Azure Trusted Signing) |
| `--verbose`       | `T3CODE_DESKTOP_VERBOSE`      | Stream subprocess stdout                             |
| `--mock-updates`  | `T3CODE_DESKTOP_MOCK_UPDATES` | Enable mock auto-updates                             |

#### Example

```bash
bun dist:desktop:win --build-version 0.0.20.01
```

## Code quality

All three must pass before considering work complete:

```bash
bun fmt          # format (oxfmt)
bun lint         # lint (oxlint)
bun typecheck    # type check (tsc across all packages)
```

## Testing

```bash
bun run test     # run all tests (Vitest)
```

> **Note:** Always use `bun run test`, never `bun test` (the latter bypasses Vitest).
