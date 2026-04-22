import { describe, expect, it } from "vitest";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { checkpointRefForThreadTurn, resolveThreadWorkspaceCwd } from "./Utils.ts";

describe("checkpointing utils", () => {
  it("builds checkpoint refs from thread id and turn count", () => {
    const ref = checkpointRefForThreadTurn(ThreadId.make("thread-1"), 2);
    expect(ref).toContain("refs/t3/checkpoints/");
    expect(ref).toContain("/turn/2");
  });

  it("prefers worktree path for agent threads", () => {
    const cwd = resolveThreadWorkspaceCwd({
      thread: {
        projectId: ProjectId.make("project-1"),
        threadKind: "agent",
        worktreePath: "/tmp/worktree-1",
      },
      projects: [
        {
          id: ProjectId.make("project-1"),
          workspaceRoot: "/tmp/workspace-1",
        },
      ],
    });
    expect(cwd).toBe("/tmp/worktree-1");
  });

  it("returns no workspace for chat threads", () => {
    const cwd = resolveThreadWorkspaceCwd({
      thread: {
        projectId: ProjectId.make("project-1"),
        threadKind: "chat",
        worktreePath: "/tmp/worktree-1",
      },
      projects: [
        {
          id: ProjectId.make("project-1"),
          workspaceRoot: "/tmp/workspace-1",
        },
      ],
    });
    expect(cwd).toBeUndefined();
  });
});
