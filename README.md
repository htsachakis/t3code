# T3 Code

T3 Code is a minimal web GUI for AI coding agents and chat. Run Codex and Claude Code sessions, or spin up lightweight AI chat threads with custom personas — all from one interface.

## Features

- **Agent mode** — run Codex or Claude Code sessions with full terminal access
- **Chat mode** — lightweight chat threads with Codex or Claude, switchable from the sidebar
- **Personas** — assign a custom system prompt to any chat thread
- **Keybindings** — fully configurable keyboard shortcuts (see [KEYBINDINGS.md](./KEYBINDINGS.md))
- **Desktop app** — native Electron shell for Windows, macOS, and Linux

## Installation

> [!WARNING]
> T3 Code currently supports Codex and Claude.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - Claude: install Claude Code and run `claude auth login`

### Run without installing

```bash
npx t3
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

```bash
yay -S t3code-bin
```

## Notes

We are very early in this project. Expect bugs.

We are not accepting contributions yet. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).

Observability guide: [docs/observability.md](./docs/observability.md)

## Local Development

See [BUILD.md](./BUILD.md) for prerequisites, dev commands, build steps, and distribution.
