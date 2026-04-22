import { describe, expect, it } from "vitest";
import {
  INTERNAL_CHAT_PROJECT_ID,
  isChatThreadKind,
  isInternalChatProjectId,
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
});
