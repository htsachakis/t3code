import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  ProjectId,
  type ProjectId as ProjectIdType,
  type ProviderKind,
  type ThreadKind,
} from "@t3tools/contracts";
import { createModelSelection, resolveModelSlugForProvider } from "./model.ts";

const INTERNAL_CHAT_PROJECT_ID_VALUE = "__t3code_internal_chat_project__";

export const INTERNAL_CHAT_PROJECT_ID = ProjectId.make(INTERNAL_CHAT_PROJECT_ID_VALUE);
export const INTERNAL_CHAT_PROJECT_TITLE = "Chats";
const CHAT_THREAD_PROVIDER_KINDS = [
  "codex",
  "claudeAgent",
  "opencode",
] as const satisfies ReadonlyArray<ProviderKind>;
const AGENT_THREAD_PROVIDER_KINDS = ["codex", "claudeAgent", "cursor", "opencode"] as const;

export function isInternalChatProjectId(
  projectId: ProjectIdType | string | null | undefined,
): boolean {
  return projectId === INTERNAL_CHAT_PROJECT_ID;
}

export function isChatThreadKind(threadKind: ThreadKind | null | undefined): boolean {
  return threadKind === "chat";
}

export function providerKindsForThreadKind(
  threadKind: ThreadKind | null | undefined,
): ReadonlyArray<ProviderKind> {
  return isChatThreadKind(threadKind) ? CHAT_THREAD_PROVIDER_KINDS : AGENT_THREAD_PROVIDER_KINDS;
}

export function isProviderAllowedForThreadKind(
  provider: ProviderKind,
  threadKind: ThreadKind | null | undefined,
): boolean {
  return providerKindsForThreadKind(threadKind).includes(provider);
}

export function filterEntriesByThreadKindProvider<T extends { provider: ProviderKind }>(
  entries: ReadonlyArray<T>,
  threadKind: ThreadKind | null | undefined,
): ReadonlyArray<T> {
  return entries.filter((entry) => isProviderAllowedForThreadKind(entry.provider, threadKind));
}

export function resolveThreadKindProvider(input: {
  threadKind: ThreadKind | null | undefined;
  requestedProvider: ProviderKind | null | undefined;
  availableProviders?: ReadonlyArray<ProviderKind> | null | undefined;
}): ProviderKind {
  const allowedProviders = providerKindsForThreadKind(input.threadKind);
  const availableProviderSet =
    input.availableProviders && input.availableProviders.length > 0
      ? new Set(input.availableProviders)
      : null;
  const selectableProviders = availableProviderSet
    ? allowedProviders.filter((provider) => availableProviderSet.has(provider))
    : allowedProviders;

  if (
    input.requestedProvider &&
    selectableProviders.includes(input.requestedProvider) &&
    isProviderAllowedForThreadKind(input.requestedProvider, input.threadKind)
  ) {
    return input.requestedProvider;
  }

  return selectableProviders[0] ?? allowedProviders[0] ?? "codex";
}

export function normalizeModelSelectionForThreadKind(input: {
  threadKind: ThreadKind | null | undefined;
  modelSelection: ModelSelection;
  availableProviders?: ReadonlyArray<ProviderKind> | null | undefined;
}): ModelSelection {
  const provider = resolveThreadKindProvider({
    threadKind: input.threadKind,
    requestedProvider: input.modelSelection.provider,
    availableProviders: input.availableProviders,
  });

  if (provider !== input.modelSelection.provider) {
    return createModelSelection(provider, DEFAULT_MODEL_BY_PROVIDER[provider]);
  }

  return createModelSelection(
    provider,
    resolveModelSlugForProvider(provider, input.modelSelection.model),
    input.modelSelection.options,
  );
}
