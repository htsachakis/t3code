import { DEFAULT_MODEL_BY_PROVIDER } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import {
  filterEntriesByThreadKindProvider,
  INTERNAL_CHAT_PROJECT_ID,
  isChatThreadKind,
  isInternalChatProjectId,
  normalizeModelSelectionForThreadKind,
  providerKindsForThreadKind,
  resolveThreadKindProvider,
} from "./chatProject.ts";

describe("chatProject", () => {
  it("recognizes the reserved internal chat project id", () => {
    expect(isInternalChatProjectId(INTERNAL_CHAT_PROJECT_ID)).toBe(true);
    expect(isInternalChatProjectId("project-1")).toBe(false);
    expect(isInternalChatProjectId(null)).toBe(false);
  });

  it("recognizes chat thread kinds", () => {
    expect(isChatThreadKind("chat")).toBe(true);
    expect(isChatThreadKind("agent")).toBe(false);
    expect(isChatThreadKind(undefined)).toBe(false);
  });

  it("returns provider sets by thread kind", () => {
    expect(providerKindsForThreadKind("chat")).toEqual(["codex", "claudeAgent"]);
    expect(providerKindsForThreadKind("agent")).toEqual([
      "codex",
      "claudeAgent",
      "cursor",
      "opencode",
    ]);
  });

  it("filters provider entries by thread kind", () => {
    const entries = [
      { provider: "cursor" as const, label: "Cursor" },
      { provider: "claudeAgent" as const, label: "Claude" },
      { provider: "codex" as const, label: "Codex" },
    ];

    expect(filterEntriesByThreadKindProvider(entries, "chat")).toEqual([
      { provider: "claudeAgent", label: "Claude" },
      { provider: "codex", label: "Codex" },
    ]);
  });

  it("resolves providers using thread-kind restrictions and availability", () => {
    expect(resolveThreadKindProvider({ threadKind: "chat", requestedProvider: "cursor" })).toBe(
      "codex",
    );
    expect(
      resolveThreadKindProvider({
        threadKind: "chat",
        requestedProvider: "codex",
        availableProviders: ["claudeAgent"],
      }),
    ).toBe("claudeAgent");
    expect(
      resolveThreadKindProvider({
        threadKind: "chat",
        requestedProvider: "claudeAgent",
        availableProviders: ["claudeAgent"],
      }),
    ).toBe("claudeAgent");
  });

  it("normalizes chat model selections away from unsupported providers", () => {
    expect(
      normalizeModelSelectionForThreadKind({
        threadKind: "chat",
        modelSelection: { provider: "cursor", model: "auto" },
        availableProviders: ["claudeAgent"],
      }),
    ).toEqual({
      provider: "claudeAgent",
      model: DEFAULT_MODEL_BY_PROVIDER.claudeAgent,
    });
  });

  it("normalizes model aliases while preserving options for supported chat providers", () => {
    expect(
      normalizeModelSelectionForThreadKind({
        threadKind: "chat",
        modelSelection: {
          provider: "codex",
          model: "gpt-5-codex",
          options: { reasoningEffort: "high" },
        },
      }),
    ).toEqual({
      provider: "codex",
      model: "gpt-5.4",
      options: { reasoningEffort: "high" },
    });
  });
});
