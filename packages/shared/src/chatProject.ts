import { ProjectId, type ProjectId as ProjectIdType, type ThreadKind } from "@t3tools/contracts";

const INTERNAL_CHAT_PROJECT_ID_VALUE = "__t3code_internal_chat_project__";

export const INTERNAL_CHAT_PROJECT_ID = ProjectId.make(INTERNAL_CHAT_PROJECT_ID_VALUE);
export const INTERNAL_CHAT_PROJECT_TITLE = "Chats";

export function isInternalChatProjectId(
  projectId: ProjectIdType | string | null | undefined,
): boolean {
  return projectId === INTERNAL_CHAT_PROJECT_ID;
}

export function isChatThreadKind(threadKind: ThreadKind | null | undefined): boolean {
  return threadKind === "chat";
}
