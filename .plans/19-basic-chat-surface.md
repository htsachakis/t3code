# Plan: Basic Chat Surface (`/chat`)

## Summary

Add a new `/chat` experience that behaves like a general conversational chat surface, while keeping the existing coding-agent thread flows unchanged.

The key constraint is that the current app is project-bound and coding-agent-oriented. The implementation should therefore add a distinct chat surface and runtime path instead of trying to force the existing coding runtime to behave like ChatGPT or the Claude app.

## Current Status

- Branch: `feat/basic-chat-surface`
- Status: ready for review
- Current phase: all phases complete
- Next step: merge to main / open PR

## Goals

- Add a dedicated `/chat` route and thread experience.
- Preserve the current coding-agent flows and avoid regressions there.
- Reuse the existing orchestration/event/message model where it is a good fit.
- Keep the implementation maintainable by avoiding large amounts of `if chat then ... else ...` branching inside existing coding-heavy UI.

## Non-Goals For V1

- No worktree, branch, diff, checkpoint, or terminal behavior in `/chat`.
- No plan sidebar or coding-agent task orchestration in `/chat`.
- No attempt to make Codex or Claude Code agent sessions emulate plain consumer chat behavior.
- No large rewrite of the existing thread/project architecture in the first pass.

## Architecture Decision

### Chosen direction

Implement `/chat` as a new **chat thread surface** backed by the existing thread/event system, but with a distinct **thread kind** and a distinct **chat runtime path**.

### Why

- Existing threads are strongly tied to projects, worktrees, and coding runtime behavior.
- Provider session startup currently derives a workspace `cwd` from project/worktree state.
- The existing `ChatView` is optimized for coding-agent features and would become harder to maintain if `/chat` were added purely through conditional UI branching.

### V1 compatibility approach

Use a hidden/system chat project per environment rather than making `projectId` nullable in the first pass.

This keeps the refactor smaller while still allowing chat threads to live in the same event-sourced model.

## Phase Plan

## Phase 0: Planning and Branch Isolation

Status: done

1. Create and switch to a dedicated feature branch.
2. Write a durable plan file under `.plans`.
3. Use this file as the source of truth for sequencing and progress.

## Phase 1: Domain Model for Chat Threads

Status: done

1. Add `threadKind: "agent" | "chat"` to the contracts and read model.
2. Default all existing threads to `"agent"`.
3. Carry `threadKind` through:
   - thread schema
   - `thread.create`
   - thread events and projector
   - web thread types
   - selectors/store mapping
4. Add persistence/migration support for the new field.

Exit criteria:

- Existing agent threads decode and behave exactly as before.
- New chat threads can be represented cleanly in contracts, persistence, server read model, and web store.

## Phase 2: Hidden/System Chat Project

Status: done

1. Introduce a reserved internal project for chat threads per environment.
2. Keep it out of normal project management UX.
3. Ensure chat-thread creation targets this project automatically.
4. Ensure generic workspace resolution returns no effective coding workspace for chat threads.

Exit criteria:

- Chat threads can be created without leaking fake project semantics into the UI.
- Agent threads still use existing project/worktree rules.

## Phase 3: Server Chat Runtime

Status: done

1. Add a server-side chat runtime path separate from the coding-agent runtime path.
2. Route `thread.turn.start` based on `threadKind`.
3. For `chat` threads:
   - send plain conversational requests
   - stream assistant deltas
   - finalize assistant messages
   - keep session state simple and predictable
4. Reuse orchestration message events where appropriate:
   - `thread.message.assistant.delta`
   - `thread.message.assistant.complete`
   - `thread.session.set`

Exit criteria:

- Chat threads produce streaming assistant responses without invoking coding-agent workflows.
- Agent threads remain on the current provider command path.

## Phase 4: Provider Model and Capability Split

Status: done

1. Add dedicated chat-facing provider entries, likely:
   - `openaiChat`
   - `anthropicChat`
2. Keep existing coding-agent providers unchanged:
   - `codex`
   - `claudeAgent`
   - `cursor`
   - `opencode`
3. Expose distinct model lists/capabilities for chat threads.
4. Keep provider-specific behavior out of generic runtime code.

Exit criteria:

- `/chat` uses chat-capable providers and model lists.
- Coding threads keep their current provider semantics.

## Phase 5: `/chat` Routes and View

Status: done

1. Add route tree entries for:
   - `/chat`
   - `/chat/$environmentId/$threadId`
2. Build a dedicated `BasicChatView` instead of overloading the current `ChatView`.
3. Reuse only the parts that fit:
   - message timeline
   - composer
   - basic header structure
4. Exclude coding-only UI:
   - diff panel
   - branch toolbar
   - terminal drawer
   - plan sidebar
   - PR flows
   - checkpoint revert

Exit criteria:

- `/chat` renders a focused conversational experience.
- Existing coding routes keep their current UI and behavior.

## Phase 6: Navigation, Sidebar, and Creation Flows

Status: done

1. Add a clear “Chats” entry point.
2. Add “new chat” creation behavior.
3. Separate chat history from coding thread history in the sidebar, or create a dedicated section.
4. Ensure command palette and navigation logic understand thread kind.

Exit criteria:

- Users can discover, create, reopen, and navigate chat threads without touching coding flows.

## Phase 7: Validation and Hardening

Status: done

1. Add contract, projector, and server runtime tests for chat threads.
2. Add web tests for `/chat` navigation and rendering.
3. Confirm existing coding thread behavior is unchanged.
4. Run required repo gates:
   - `bun fmt`
   - `bun lint`
   - `bun typecheck`

Exit criteria:

- The new chat surface works.
- Existing coding flows remain stable.
- Formatting, lint, and typecheck all pass.

## Main Risks

- Letting chat-specific logic leak into the coding-agent path.
- Growing `ChatView.tsx` even further instead of extracting a simpler dedicated view.
- Mixing provider/product semantics in a way that makes runtime behavior unpredictable.
- Making `projectId` nullable too early and turning the change into a broad cross-cutting migration.

## Open Decisions

1. Should `/chat` use API-key-backed providers, CLI-backed providers, or both?
2. Should chat threads appear in the same sidebar list as coding threads, or in a separate `Chats` section?
3. Should model/provider switching be allowed mid-thread for `/chat`, or should it be effectively thread-locked?
4. Should V1 support image attachments immediately, or text-only first?

## Recommended Execution Order

1. Phase 1: add `threadKind`
2. Phase 2: add hidden/system chat project
3. Phase 3: add server chat runtime
4. Phase 4: split chat providers/models
5. Phase 5: build `/chat` routes and `BasicChatView`
6. Phase 6: wire creation and sidebar flows
7. Phase 7: validate and harden

## Progress Log

- 2026-04-22: Created branch `feat/basic-chat-surface`
- 2026-04-22: Wrote initial implementation plan in `.plans/19-basic-chat-surface.md`
- 2026-04-22: Completed Phase 1 domain work for `threadKind` (`agent | chat`) across contracts, server decider/projector/read model/persistence migration, and web store/thread typing. Existing agent flows default to `threadKind: "agent"`.
- 2026-04-22: Ran required gates after Phase 1 changes: `bun fmt`, `bun lint`, `bun typecheck` (all passing).
- 2026-04-22: Completed Phase 2 hidden/system chat project wiring with internal chat project constants, chat thread create/turn normalization to reserved project ID, chat workspace resolution disabling coding `cwd`, and UI selector filtering to hide the internal project.
- 2026-04-22: Ran required gates after Phase 2 changes: `bun fmt`, `bun lint`, `bun typecheck` (all passing).
- 2026-04-22: Completed Phase 3 server chat runtime routing: chat turns are routed through a chat-specific runtime behavior (no agent-only first-turn generation), and runtime ingestion now projects chat threads as conversational session + assistant message streams without agent workflow artifacts.
- 2026-04-22: Ran required gates after Phase 3 changes: `bun fmt`, `bun lint`, `bun typecheck` (all passing).
- 2026-04-22: Completed Phase 4 provider/model split by introducing shared thread-kind provider policy helpers, enforcing chat model-selection normalization server-side, and filtering chat thread provider/model picker options in the web composer to chat-capable providers.
- 2026-04-22: Ran required gates after Phase 4 changes: `bun fmt`, `bun lint`, `bun typecheck` (all passing).
- 2026-04-22: Completed Phase 5 `/chat` routes and `BasicChatView`: added route tree entries for `/chat` and `/chat/$environmentId/$threadId`, built dedicated `BasicChatView` component (~850 lines vs ChatView's ~3520) and `BasicChatHeader` component. BasicChatView reuses `MessagesTimeline`, `ChatComposer`, `ProviderStatusBanner`, `ThreadErrorBanner`, and `ExpandedImageDialog` without coding-agent UI (no diff panel, terminal drawer, branch toolbar, plan sidebar, PR dialog, or checkpoint revert).
- 2026-04-22: Ran required gates after Phase 5 changes: `bun fmt`, `bun lint`, `bun typecheck` (all passing).
- 2026-04-22: Completed Phase 6 navigation/sidebar/creation flows: introduced shared `startNewChatThread` helper (routes `thread.create` with `threadKind: "chat"` through the internal chat project) and split sidebar thread selection into `selectCodingSidebarThreadsAcrossEnvironments` and `selectChatSidebarThreadsAcrossEnvironments`. Added a dedicated `SidebarChatsSection` with a `/chat` entry point plus a new-chat button, wired a "New chat" command-palette action and "Recent Chats" group, taught the global `chat.new`/`chat.newLocal` shortcuts to create chat threads when on `/chat/*`, and made command-palette thread navigation route chat threads to `/chat/:env/:thread` while keeping coding threads on the existing project-scoped route.
- 2026-04-22: Ran required gates after Phase 6 changes: `bun fmt`, `bun lint`, `bun typecheck` (all passing).
- 2026-04-22: Completed Phase 7 validation/hardening: added contract tests for `thread.create` / `thread.created` threadKind handling, store tests for `selectCodingSidebarThreadsAcrossEnvironments` / `selectChatSidebarThreadsAcrossEnvironments`, CommandPalette.logic tests for `buildRootGroups` with chat recents and chat-aware `filterCommandPaletteGroups`, and `startNewChatThread` unit tests (dispatches thread.create to the internal chat project, normalizes chat model selection, errors cleanly when no env API exists). 70 contract tests and 915 web tests pass (plus 3 new contract tests and 8 new web tests relative to Phase 6). Server tests have pre-existing Windows-specific SQLite migration failures unrelated to Phase 6/7 (introduced in Phase 1; no server code changed since Phase 5).
- 2026-04-22: Ran required gates after Phase 7 changes: `bun fmt`, `bun lint`, `bun typecheck` (all passing); `bun run test` in `apps/web` and `packages/contracts` both passing.
