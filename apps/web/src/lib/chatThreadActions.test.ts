import { scopeProjectRef } from "@t3tools/client-runtime";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { INTERNAL_CHAT_PROJECT_ID } from "@t3tools/shared/chatProject";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchCommandMock = vi.fn<(command: Record<string, unknown>) => Promise<void>>(
  async () => undefined,
);
const readEnvironmentApiMock = vi.fn<(environmentId: EnvironmentId) => unknown>();

vi.mock("../environmentApi", () => ({
  readEnvironmentApi: (environmentId: EnvironmentId) => readEnvironmentApiMock(environmentId),
}));

import {
  resolveThreadActionProjectRef,
  startNewChatThread,
  startNewLocalThreadFromContext,
  startNewThreadFromContext,
  type ChatThreadActionContext,
} from "./chatThreadActions";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const PROJECT_ID = ProjectId.make("project-1");
const FALLBACK_PROJECT_ID = ProjectId.make("project-2");

function createContext(overrides: Partial<ChatThreadActionContext> = {}): ChatThreadActionContext {
  return {
    activeDraftThread: null,
    activeThread: undefined,
    defaultProjectRef: scopeProjectRef(ENVIRONMENT_ID, FALLBACK_PROJECT_ID),
    defaultThreadEnvMode: "local",
    handleNewThread: async () => {},
    ...overrides,
  };
}

describe("chatThreadActions", () => {
  it("prefers the active draft thread project when resolving thread actions", () => {
    const projectRef = resolveThreadActionProjectRef(
      createContext({
        activeDraftThread: {
          environmentId: ENVIRONMENT_ID,
          projectId: PROJECT_ID,
          branch: "feature/refactor",
          worktreePath: "/tmp/worktree",
          envMode: "worktree",
        },
      }),
    );

    expect(projectRef).toEqual(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID));
  });

  it("falls back to the default project ref when there is no active thread context", () => {
    const projectRef = resolveThreadActionProjectRef(
      createContext({
        defaultProjectRef: scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID),
      }),
    );

    expect(projectRef).toEqual(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID));
  });

  it("starts a contextual new thread from the active draft thread", async () => {
    const handleNewThread = vi.fn<ChatThreadActionContext["handleNewThread"]>(async () => {});

    const didStart = await startNewThreadFromContext(
      createContext({
        activeDraftThread: {
          environmentId: ENVIRONMENT_ID,
          projectId: PROJECT_ID,
          branch: "feature/refactor",
          worktreePath: "/tmp/worktree",
          envMode: "worktree",
        },
        handleNewThread,
      }),
    );

    expect(didStart).toBe(true);
    expect(handleNewThread).toHaveBeenCalledWith(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), {
      branch: "feature/refactor",
      worktreePath: "/tmp/worktree",
      envMode: "worktree",
    });
  });

  it("starts a local thread with the configured default env mode", async () => {
    const handleNewThread = vi.fn<ChatThreadActionContext["handleNewThread"]>(async () => {});

    const didStart = await startNewLocalThreadFromContext(
      createContext({
        defaultProjectRef: scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID),
        defaultThreadEnvMode: "worktree",
        handleNewThread,
      }),
    );

    expect(didStart).toBe(true);
    expect(handleNewThread).toHaveBeenCalledWith(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), {
      envMode: "worktree",
    });
  });

  it("does not start a thread when there is no project context", async () => {
    const handleNewThread = vi.fn<ChatThreadActionContext["handleNewThread"]>(async () => {});

    const didStart = await startNewThreadFromContext(
      createContext({
        defaultProjectRef: null,
        handleNewThread,
      }),
    );

    expect(didStart).toBe(false);
    expect(handleNewThread).not.toHaveBeenCalled();
  });
});

describe("startNewChatThread", () => {
  beforeEach(() => {
    dispatchCommandMock.mockReset();
    dispatchCommandMock.mockResolvedValue(undefined);
    readEnvironmentApiMock.mockReset();
    readEnvironmentApiMock.mockReturnValue({
      orchestration: {
        dispatchCommand: dispatchCommandMock,
      },
    });
  });

  it("dispatches thread.create targeting the internal chat project", async () => {
    const result = await startNewChatThread({ environmentId: ENVIRONMENT_ID });

    expect(readEnvironmentApiMock).toHaveBeenCalledWith(ENVIRONMENT_ID);
    expect(dispatchCommandMock).toHaveBeenCalledTimes(1);
    const dispatched = dispatchCommandMock.mock.calls[0]?.[0];
    expect(dispatched).toMatchObject({
      type: "thread.create",
      threadKind: "chat",
      projectId: INTERNAL_CHAT_PROJECT_ID,
      branch: null,
      worktreePath: null,
    });
    expect(result.environmentId).toBe(ENVIRONMENT_ID);
    expect(typeof result.threadId).toBe("string");
    expect(result.threadId.length).toBeGreaterThan(0);
  });

  it("normalizes requested chat model selection to a chat-capable provider", async () => {
    await startNewChatThread({
      environmentId: ENVIRONMENT_ID,
      modelSelection: { provider: "cursor", model: "auto" },
      availableProviders: ["claudeAgent"],
    });

    const dispatched = dispatchCommandMock.mock.calls[0]?.[0] as {
      modelSelection?: { provider?: string };
    };
    expect(dispatched?.modelSelection?.provider).toBe("claudeAgent");
  });

  it("throws when no environment API is available", async () => {
    readEnvironmentApiMock.mockReturnValue(undefined);
    await expect(startNewChatThread({ environmentId: ENVIRONMENT_ID })).rejects.toThrow(
      /No environment API available/,
    );
    expect(dispatchCommandMock).not.toHaveBeenCalled();
  });
});
