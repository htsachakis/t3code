import {
  type ApprovalRequestId,
  type EnvironmentId,
  type ModelSelection,
  type ProviderApprovalDecision,
  type ProviderKind,
  type ServerProvider,
  type ThreadId,
  OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime";
import { applyClaudePromptEffortPrefix } from "@t3tools/shared/model";
import {
  filterEntriesByThreadKindProvider,
  isProviderAllowedForThreadKind,
  resolveThreadKindProvider,
} from "@t3tools/shared/chatProject";
import { truncate } from "@t3tools/shared/String";
import { Debouncer } from "@tanstack/react-pacer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LegendListRef } from "@legendapp/list/react";
import { ChevronDownIcon } from "lucide-react";

import { readEnvironmentApi } from "../environmentApi";
import { isElectron } from "../env";
import { collapseExpandedComposerCursor } from "../composer-logic";
import {
  deriveCompletionDividerBeforeEntryId,
  derivePendingApprovals,
  derivePendingUserInputs,
  derivePhase,
  deriveTimelineEntries,
  deriveActiveWorkStartedAt,
  deriveWorkLogEntries,
  hasToolActivityForTurn,
  isLatestTurnSettled,
  formatElapsed,
} from "../session-logic";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "../pendingUserInput";
import { useStore } from "../store";
import { createProjectSelectorByRef, createThreadSelectorByRef } from "../storeSelectors";
import { useUiStateStore } from "../uiStateStore";
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type ChatMessage,
  type SessionPhase,
  type Thread,
} from "../types";
import { useTheme } from "../hooks/useTheme";
import { getProviderModelCapabilities } from "../providerModels";
import { useSettings } from "../hooks/useSettings";
import { resolveAppModelSelection } from "../modelSelection";
import { useSavedEnvironmentRuntimeStore } from "../environments/runtime";
import { type ComposerImageAttachment, useComposerDraftStore } from "../composerDraftStore";
import { appendTerminalContextsToPrompt, type TerminalContextDraft } from "../lib/terminalContext";
import { usePersonaStore } from "../personaStore";
import { ChatComposer, type ChatComposerHandle } from "./chat/ChatComposer";
import { ExpandedImageDialog } from "./chat/ExpandedImageDialog";
import { MessagesTimeline } from "./chat/MessagesTimeline";
import { BasicChatHeader } from "./chat/BasicChatHeader";
import { type ExpandedImagePreview } from "./chat/ExpandedImagePreview";
import { NoActiveThreadState } from "./NoActiveThreadState";
import { ProviderStatusBanner } from "./chat/ProviderStatusBanner";
import { ThreadErrorBanner } from "./chat/ThreadErrorBanner";
import {
  createLocalDispatchSnapshot,
  deriveComposerSendState,
  hasServerAcknowledgedLocalDispatch,
  type LocalDispatchSnapshot,
  cloneComposerImageForRetry,
  deriveLockedProvider,
  readFileAsDataUrl,
  revokeUserMessagePreviewUrls,
} from "./ChatView.logic";
import { useComposerHandleContext } from "../composerHandleContext";
import { useServerConfig, useServerKeybindings } from "~/rpc/serverState";
import { sanitizeThreadErrorMessage } from "~/rpc/transportError";
import { retainThreadDetailSubscription } from "../environments/runtime/service";
import { cn } from "~/lib/utils";
import { newCommandId, newMessageId } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "../environments/primary";

const IMAGE_ONLY_BOOTSTRAP_PROMPT =
  "[User attached one or more images without additional text. Respond using the conversation context and the attached image(s).]";
const EMPTY_ACTIVITIES: OrchestrationThreadActivity[] = [];
const EMPTY_PROVIDERS: ServerProvider[] = [];
const EMPTY_PENDING_USER_INPUT_ANSWERS: Record<string, PendingUserInputDraftAnswer> = {};

function formatOutgoingPrompt(params: {
  provider: ProviderKind;
  model: string | null;
  models: ReadonlyArray<ServerProvider["models"][number]>;
  effort: string | null;
  text: string;
}): string {
  const caps = getProviderModelCapabilities(params.models, params.model, params.provider);
  if (params.effort && caps.promptInjectedEffortLevels.includes(params.effort)) {
    return applyClaudePromptEffortPrefix(
      params.text,
      params.effort as Parameters<typeof applyClaudePromptEffortPrefix>[1],
    );
  }
  return params.text;
}

// ---------------------------------------------------------------------------
// Local dispatch tracking (simplified from ChatView)
// ---------------------------------------------------------------------------

function useLocalDispatchState(input: {
  activeThread: Thread | undefined;
  activeLatestTurn: Thread["latestTurn"] | null;
  phase: SessionPhase;
  threadError: string | null | undefined;
}) {
  const [localDispatch, setLocalDispatch] = useState<LocalDispatchSnapshot | null>(null);

  const beginLocalDispatch = useCallback(() => {
    setLocalDispatch((current) => {
      if (current) return current;
      return createLocalDispatchSnapshot(input.activeThread);
    });
  }, [input.activeThread]);

  const resetLocalDispatch = useCallback(() => {
    setLocalDispatch(null);
  }, []);

  const serverAcknowledgedLocalDispatch = useMemo(
    () =>
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: input.phase,
        latestTurn: input.activeLatestTurn,
        session: input.activeThread?.session ?? null,
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: input.threadError,
      }),
    [
      input.activeLatestTurn,
      input.activeThread?.session,
      input.phase,
      input.threadError,
      localDispatch,
    ],
  );

  useEffect(() => {
    if (!serverAcknowledgedLocalDispatch) return;
    resetLocalDispatch();
  }, [resetLocalDispatch, serverAcknowledgedLocalDispatch]);

  return {
    beginLocalDispatch,
    resetLocalDispatch,
    localDispatchStartedAt: localDispatch?.startedAt ?? null,
    isSendBusy: localDispatch !== null && !serverAcknowledgedLocalDispatch,
  };
}

// ---------------------------------------------------------------------------
// BasicChatView
// ---------------------------------------------------------------------------

export interface BasicChatViewProps {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  reserveTitleBarControlInset?: boolean;
}

export default function BasicChatView(props: BasicChatViewProps) {
  const { environmentId, threadId, reserveTitleBarControlInset = true } = props;
  const routeThreadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const routeThreadKey = useMemo(() => scopedThreadKey(routeThreadRef), [routeThreadRef]);
  const composerDraftTarget = routeThreadRef;
  const serverThread = useStore(
    useMemo(() => createThreadSelectorByRef(routeThreadRef), [routeThreadRef]),
  );
  const setStoreThreadError = useStore((store) => store.setError);
  const markThreadVisited = useUiStateStore((store) => store.markThreadVisited);
  const activeThreadLastVisitedAt = useUiStateStore(
    (store) => store.threadLastVisitedAtById[routeThreadKey],
  );
  const settings = useSettings();
  const setStickyComposerModelSelection = useComposerDraftStore(
    (store) => store.setStickyModelSelection,
  );
  const timestampFormat = settings.timestampFormat;
  const { resolvedTheme } = useTheme();

  // Composer draft selectors
  const composerActiveProvider = useComposerDraftStore(
    (store) => store.getComposerDraft(composerDraftTarget)?.activeProvider ?? null,
  );
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const setComposerDraftModelSelection = useComposerDraftStore((store) => store.setModelSelection);
  const clearComposerDraftContent = useComposerDraftStore((store) => store.clearComposerContent);

  const promptRef = useRef("");
  const composerImagesRef = useRef<ComposerImageAttachment[]>([]);
  const composerTerminalContextsRef = useRef<TerminalContextDraft[]>([]);
  const localComposerRef = useRef<ChatComposerHandle | null>(null);
  const composerRef = useComposerHandleContext() ?? localComposerRef;
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null);
  const [optimisticUserMessages, setOptimisticUserMessages] = useState<ChatMessage[]>([]);
  const optimisticUserMessagesRef = useRef(optimisticUserMessages);
  optimisticUserMessagesRef.current = optimisticUserMessages;
  const [isConnecting] = useState(false);
  const [respondingRequestIds, setRespondingRequestIds] = useState<ApprovalRequestId[]>([]);
  const [respondingUserInputRequestIds, setRespondingUserInputRequestIds] = useState<
    ApprovalRequestId[]
  >([]);
  const [pendingUserInputAnswersByRequestId, setPendingUserInputAnswersByRequestId] = useState<
    Record<string, Record<string, PendingUserInputDraftAnswer>>
  >({});
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Record<string, number>>({});
  const legendListRef = useRef<LegendListRef | null>(null);
  const isAtEndRef = useRef(true);
  const sendInFlightRef = useRef(false);

  const activeThread = serverThread;
  const isServerThread = serverThread !== undefined;
  const activeThreadId = activeThread?.id ?? null;
  const runtimeMode = DEFAULT_RUNTIME_MODE;
  const interactionMode = DEFAULT_INTERACTION_MODE;
  const activeLatestTurn = activeThread?.latestTurn ?? null;

  // Thread detail subscription
  useEffect(() => {
    return retainThreadDetailSubscription(environmentId, threadId);
  }, [environmentId, threadId]);

  // Mark thread visited
  useEffect(() => {
    if (!serverThread?.id) return;
    const latestTurnSettledLocal = isLatestTurnSettled(
      activeLatestTurn,
      activeThread?.session ?? null,
    );
    if (!latestTurnSettledLocal) return;
    if (!activeLatestTurn?.completedAt) return;
    const turnCompletedAt = Date.parse(activeLatestTurn.completedAt);
    if (Number.isNaN(turnCompletedAt)) return;
    const lastVisitedAt = activeThreadLastVisitedAt ? Date.parse(activeThreadLastVisitedAt) : NaN;
    if (!Number.isNaN(lastVisitedAt) && lastVisitedAt >= turnCompletedAt) return;
    markThreadVisited(scopedThreadKey(scopeThreadRef(serverThread.environmentId, serverThread.id)));
  }, [
    activeLatestTurn,
    activeThread?.session,
    activeThreadLastVisitedAt,
    markThreadVisited,
    serverThread?.environmentId,
    serverThread?.id,
  ]);

  // Provider/model resolution
  const selectedProviderByThreadId = composerActiveProvider ?? null;
  const activeThreadKind = "chat" as const;
  const threadProvider = activeThread?.modelSelection.provider ?? null;
  const rawLockedProvider = deriveLockedProvider({
    thread: activeThread,
    selectedProvider: selectedProviderByThreadId,
    threadProvider,
  });
  const lockedProvider =
    rawLockedProvider && isProviderAllowedForThreadKind(rawLockedProvider, activeThreadKind)
      ? rawLockedProvider
      : null;
  const primaryServerConfig = useServerConfig();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const activeEnvRuntimeState = useSavedEnvironmentRuntimeStore((s) =>
    activeThread?.environmentId ? s.byId[activeThread.environmentId] : null,
  );
  const serverConfig =
    primaryEnvironmentId && activeThread?.environmentId === primaryEnvironmentId
      ? primaryServerConfig
      : (activeEnvRuntimeState?.serverConfig ?? primaryServerConfig);
  const providerStatuses = serverConfig?.providers ?? EMPTY_PROVIDERS;
  const threadProviderStatuses = useMemo(
    () => filterEntriesByThreadKindProvider(providerStatuses, activeThreadKind),
    [providerStatuses, activeThreadKind],
  );
  const enabledThreadProviderKinds = useMemo(
    () =>
      threadProviderStatuses.filter((status) => status.enabled).map((status) => status.provider),
    [threadProviderStatuses],
  );
  const unlockedSelectedProvider = resolveThreadKindProvider({
    threadKind: activeThreadKind,
    requestedProvider: selectedProviderByThreadId ?? threadProvider ?? "codex",
    availableProviders: enabledThreadProviderKinds,
  });
  const selectedProvider: ProviderKind = lockedProvider ?? unlockedSelectedProvider;
  const phase = derivePhase(activeThread?.session ?? null);
  const threadActivities = activeThread?.activities ?? EMPTY_ACTIVITIES;
  const workLogEntries = useMemo(
    () => deriveWorkLogEntries(threadActivities, activeLatestTurn?.turnId ?? undefined),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const latestTurnHasToolActivity = useMemo(
    () => hasToolActivityForTurn(threadActivities, activeLatestTurn?.turnId),
    [activeLatestTurn?.turnId, threadActivities],
  );
  const latestTurnSettled = isLatestTurnSettled(activeLatestTurn, activeThread?.session ?? null);

  // Pending approvals/inputs (chat threads may still surface these from provider)
  const pendingApprovals = useMemo(
    () => derivePendingApprovals(threadActivities),
    [threadActivities],
  );
  const pendingUserInputs = useMemo(
    () => derivePendingUserInputs(threadActivities),
    [threadActivities],
  );
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const activePendingDraftAnswers = useMemo(
    () =>
      activePendingUserInput
        ? (pendingUserInputAnswersByRequestId[activePendingUserInput.requestId] ??
          EMPTY_PENDING_USER_INPUT_ANSWERS)
        : EMPTY_PENDING_USER_INPUT_ANSWERS,
    [activePendingUserInput, pendingUserInputAnswersByRequestId],
  );
  const activePendingQuestionIndex = activePendingUserInput
    ? (pendingUserInputQuestionIndexByRequestId[activePendingUserInput.requestId] ?? 0)
    : 0;
  const activePendingProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            activePendingDraftAnswers,
            activePendingQuestionIndex,
          )
        : null,
    [activePendingDraftAnswers, activePendingQuestionIndex, activePendingUserInput],
  );
  const activePendingResolvedAnswers = useMemo(
    () =>
      activePendingUserInput
        ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingDraftAnswers)
        : null,
    [activePendingDraftAnswers, activePendingUserInput],
  );
  const activePendingIsResponding = activePendingUserInput
    ? respondingUserInputRequestIds.includes(activePendingUserInput.requestId)
    : false;
  const activePendingApproval = pendingApprovals[0] ?? null;

  // Local dispatch state
  const { beginLocalDispatch, resetLocalDispatch, localDispatchStartedAt, isSendBusy } =
    useLocalDispatchState({
      activeThread,
      activeLatestTurn,
      phase,
      threadError: activeThread?.error,
    });
  const isWorking = phase === "running" || isSendBusy || isConnecting;
  const activeWorkStartedAt = deriveActiveWorkStartedAt(
    activeLatestTurn,
    activeThread?.session ?? null,
    localDispatchStartedAt,
  );

  // Per-thread component state (optimistic messages, in-flight dispatch,
  // pending approval/input responses, expanded image) must be cleared when
  // switching threads. The route reuses this component instance across
  // thread switches, so without this reset an optimistic message from
  // thread A leaks into thread B's timeline.
  useEffect(() => {
    setOptimisticUserMessages((existing) => {
      for (const message of existing) {
        revokeUserMessagePreviewUrls(message);
      }
      return [];
    });
    resetLocalDispatch();
    setRespondingRequestIds([]);
    setRespondingUserInputRequestIds([]);
    setPendingUserInputAnswersByRequestId({});
    setPendingUserInputQuestionIndexByRequestId({});
    setExpandedImage(null);
  }, [resetLocalDispatch, threadId]);

  // Project resolution (chat threads still have a project — the internal chat project)
  const activeProjectRef = activeThread
    ? scopeProjectRef(activeThread.environmentId, activeThread.projectId)
    : null;
  const activeProject = useStore(
    useMemo(() => createProjectSelectorByRef(activeProjectRef), [activeProjectRef]),
  );

  // Timeline
  const timelineMessages = useMemo(() => {
    const messages = activeThread?.messages ?? [];
    if (optimisticUserMessages.length === 0) return messages;
    const serverIds = new Set(messages.map((m) => m.id));
    const pending = optimisticUserMessages.filter((m) => !serverIds.has(m.id));
    if (pending.length === 0) return messages;
    return [...messages, ...pending];
  }, [activeThread?.messages, optimisticUserMessages]);
  const timelineEntries = useMemo(
    () =>
      deriveTimelineEntries(timelineMessages, activeThread?.proposedPlans ?? [], workLogEntries),
    [activeThread?.proposedPlans, timelineMessages, workLogEntries],
  );
  const completionSummary = useMemo(() => {
    if (!latestTurnSettled) return null;
    if (!activeLatestTurn?.startedAt) return null;
    if (!activeLatestTurn.completedAt) return null;
    if (!latestTurnHasToolActivity) return null;
    const elapsed = formatElapsed(activeLatestTurn.startedAt, activeLatestTurn.completedAt);
    return elapsed ? `Worked for ${elapsed}` : null;
  }, [
    activeLatestTurn?.completedAt,
    activeLatestTurn?.startedAt,
    latestTurnHasToolActivity,
    latestTurnSettled,
  ]);
  const completionDividerBeforeEntryId = useMemo(() => {
    if (!latestTurnSettled) return null;
    if (!completionSummary) return null;
    return deriveCompletionDividerBeforeEntryId(timelineEntries, activeLatestTurn);
  }, [activeLatestTurn, completionSummary, latestTurnSettled, timelineEntries]);

  // Provider status
  const activeProviderStatus = useMemo(
    () => threadProviderStatuses.find((status) => status.provider === selectedProvider) ?? null,
    [selectedProvider, threadProviderStatuses],
  );

  // Error handling
  const setThreadError = useCallback(
    (targetThreadId: ThreadId | null, error: string | null) => {
      if (!targetThreadId) return;
      const nextError = sanitizeThreadErrorMessage(error);
      setStoreThreadError(targetThreadId, nextError);
    },
    [setStoreThreadError],
  );

  // Composer focus
  const focusComposer = useCallback(() => {
    composerRef.current?.focusAtEnd();
  }, []);
  const scheduleComposerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusComposer();
    });
  }, [focusComposer]);

  // Scroll management
  const showScrollDebouncer = useRef(
    new Debouncer((value: boolean) => setShowScrollToBottom(value), { wait: 120 }),
  );
  const scrollToEnd = useCallback((animated?: boolean) => {
    isAtEndRef.current = true;
    showScrollDebouncer.current.cancel();
    setShowScrollToBottom(false);
    void legendListRef.current?.scrollToEnd?.({ animated: animated ?? false });
  }, []);
  const onIsAtEndChange = useCallback((isAtEnd: boolean) => {
    isAtEndRef.current = isAtEnd;
    if (isAtEnd) {
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
    } else {
      showScrollDebouncer.current.maybeExecute(true);
    }
  }, []);

  // Close expanded image
  const closeExpandedImage = useCallback(() => {
    setExpandedImage(null);
  }, []);

  // Persist thread settings before sending
  const persistThreadSettingsForNextTurn = useCallback(
    async (input: { threadId: ThreadId; modelSelection?: ModelSelection }) => {
      if (!serverThread) return;
      const api = readEnvironmentApi(environmentId);
      if (!api) return;
      if (
        input.modelSelection !== undefined &&
        (input.modelSelection.model !== serverThread.modelSelection.model ||
          input.modelSelection.provider !== serverThread.modelSelection.provider ||
          JSON.stringify(input.modelSelection.options ?? null) !==
            JSON.stringify(serverThread.modelSelection.options ?? null))
      ) {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: input.threadId,
          modelSelection: input.modelSelection,
        });
      }
    },
    [environmentId, serverThread],
  );

  // Send message
  const onSend = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    const api = readEnvironmentApi(environmentId);
    if (!api || !activeThread || isSendBusy || isConnecting || sendInFlightRef.current) return;
    if (activePendingProgress) {
      onAdvanceActivePendingUserInput();
      return;
    }
    const sendCtx = composerRef.current?.getSendContext();
    if (!sendCtx) return;
    const {
      images: composerImages,
      terminalContexts: composerTerminalContexts,
      selectedProvider: ctxSelectedProvider,
      selectedModel: ctxSelectedModel,
      selectedProviderModels: ctxSelectedProviderModels,
      selectedPromptEffort: ctxSelectedPromptEffort,
      selectedModelSelection: ctxSelectedModelSelection,
    } = sendCtx;
    const promptForSend = promptRef.current;
    const { trimmedPrompt: trimmed, hasSendableContent } = deriveComposerSendState({
      prompt: promptForSend,
      imageCount: composerImages.length,
      terminalContexts: composerTerminalContexts,
    });
    if (!hasSendableContent) return;
    if (!activeProject) return;

    sendInFlightRef.current = true;
    beginLocalDispatch();

    const composerImagesSnapshot = [...composerImages];
    const messageTextForSend = appendTerminalContextsToPrompt(promptForSend, []);
    const messageIdForSend = newMessageId();
    const messageCreatedAt = new Date().toISOString();
    const isFirstMessage = activeThread.messages.length === 0;
    const personaSystemPrompt = usePersonaStore
      .getState()
      .getPersonaForThread(routeThreadKey)
      .systemPrompt.trim();
    const outgoingMessageText = formatOutgoingPrompt({
      provider: ctxSelectedProvider,
      model: ctxSelectedModel,
      models: ctxSelectedProviderModels,
      effort: ctxSelectedPromptEffort,
      text: messageTextForSend || IMAGE_ONLY_BOOTSTRAP_PROMPT,
    });
    const turnAttachmentsPromise = Promise.all(
      composerImagesSnapshot.map(async (image) => ({
        type: "image" as const,
        name: image.name,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        dataUrl: await readFileAsDataUrl(image.file),
      })),
    );
    const optimisticAttachments = composerImagesSnapshot.map((image) => ({
      type: "image" as const,
      id: image.id,
      name: image.name,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      previewUrl: image.previewUrl,
    }));

    isAtEndRef.current = true;
    showScrollDebouncer.current.cancel();
    setShowScrollToBottom(false);
    await legendListRef.current?.scrollToEnd?.({ animated: false });

    setOptimisticUserMessages((existing) => [
      ...existing,
      {
        id: messageIdForSend,
        role: "user",
        text: outgoingMessageText,
        ...(optimisticAttachments.length > 0 ? { attachments: optimisticAttachments } : {}),
        createdAt: messageCreatedAt,
        streaming: false,
      },
    ]);

    setThreadError(activeThread.id, null);
    promptRef.current = "";
    clearComposerDraftContent(composerDraftTarget);
    composerRef.current?.resetCursorState();

    let turnStartSucceeded = false;
    await (async () => {
      const title = truncate(trimmed || "New chat");

      // Auto-title from first message
      if (isFirstMessage && isServerThread) {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: activeThread.id,
          title,
        });
      }

      if (isServerThread && ctxSelectedModel) {
        await persistThreadSettingsForNextTurn({
          threadId: activeThread.id,
          modelSelection: ctxSelectedModelSelection,
        });
      }

      const turnAttachments = await turnAttachmentsPromise;
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: activeThread.id,
        message: {
          messageId: messageIdForSend,
          role: "user",
          text: outgoingMessageText,
          attachments: turnAttachments,
        },
        modelSelection: ctxSelectedModelSelection,
        titleSeed: title,
        runtimeMode,
        interactionMode,
        ...(personaSystemPrompt.length > 0 ? { systemPrompt: personaSystemPrompt } : {}),
        createdAt: messageCreatedAt,
      });
      turnStartSucceeded = true;
    })().catch(async (err: unknown) => {
      if (
        !turnStartSucceeded &&
        promptRef.current.length === 0 &&
        composerImagesRef.current.length === 0
      ) {
        setOptimisticUserMessages((existing) => {
          const removed = existing.filter((message) => message.id === messageIdForSend);
          for (const message of removed) {
            revokeUserMessagePreviewUrls(message);
          }
          return existing.filter((message) => message.id !== messageIdForSend);
        });
        promptRef.current = promptForSend;
        const retryComposerImages = composerImagesSnapshot.map(cloneComposerImageForRetry);
        composerImagesRef.current = retryComposerImages;
        setComposerDraftPrompt(composerDraftTarget, promptForSend);
        addComposerDraftImages(composerDraftTarget, retryComposerImages);
        composerRef.current?.resetCursorState({
          cursor: collapseExpandedComposerCursor(promptForSend, promptForSend.length),
          prompt: promptForSend,
          detectTrigger: true,
        });
      }
      setThreadError(
        activeThread.id,
        err instanceof Error ? err.message : "Failed to send message.",
      );
    });
    sendInFlightRef.current = false;
    if (!turnStartSucceeded) {
      resetLocalDispatch();
    }
  };

  // Interrupt
  const onInterrupt = async () => {
    const api = readEnvironmentApi(environmentId);
    if (!api || !activeThread) return;
    await api.orchestration.dispatchCommand({
      type: "thread.turn.interrupt",
      commandId: newCommandId(),
      threadId: activeThread.id,
      createdAt: new Date().toISOString(),
    });
  };

  // Approval responses (passthrough — chat threads rarely have these)
  const onRespondToApproval = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      const api = readEnvironmentApi(environmentId);
      if (!api || !activeThreadId) return;
      setRespondingRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      await api.orchestration
        .dispatchCommand({
          type: "thread.approval.respond",
          commandId: newCommandId(),
          threadId: activeThreadId,
          requestId,
          decision,
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setThreadError(
            activeThreadId,
            err instanceof Error ? err.message : "Failed to submit approval decision.",
          );
        });
      setRespondingRequestIds((existing) => existing.filter((id) => id !== requestId));
    },
    [activeThreadId, environmentId, setThreadError],
  );

  // User input responses
  const onRespondToUserInput = useCallback(
    async (requestId: ApprovalRequestId, answers: Record<string, unknown>) => {
      const api = readEnvironmentApi(environmentId);
      if (!api || !activeThreadId) return;
      setRespondingUserInputRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      await api.orchestration
        .dispatchCommand({
          type: "thread.user-input.respond",
          commandId: newCommandId(),
          threadId: activeThreadId,
          requestId,
          answers,
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setThreadError(
            activeThreadId,
            err instanceof Error ? err.message : "Failed to submit user input.",
          );
        });
      setRespondingUserInputRequestIds((existing) => existing.filter((id) => id !== requestId));
    },
    [activeThreadId, environmentId, setThreadError],
  );

  // Pending user input handlers
  const onSelectActivePendingUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      if (!activePendingUserInput) return;
      setPendingUserInputAnswersByRequestId((existing) => {
        const question =
          (activePendingProgress?.activeQuestion?.id === questionId
            ? activePendingProgress.activeQuestion
            : undefined) ??
          activePendingUserInput.questions.find((entry) => entry.id === questionId);
        if (!question) return existing;
        return {
          ...existing,
          [activePendingUserInput.requestId]: {
            ...existing[activePendingUserInput.requestId],
            [questionId]: togglePendingUserInputOptionSelection(
              question,
              existing[activePendingUserInput.requestId]?.[questionId],
              optionLabel,
            ),
          },
        };
      });
      promptRef.current = "";
      composerRef.current?.resetCursorState({ cursor: 0 });
    },
    [activePendingProgress?.activeQuestion, activePendingUserInput],
  );

  const onAdvanceActivePendingUserInput = useCallback(() => {
    if (!activePendingUserInput || !activePendingProgress) return;
    if (!activePendingProgress.isLastQuestion) {
      setPendingUserInputQuestionIndexByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: activePendingQuestionIndex + 1,
      }));
      return;
    }
    if (!activePendingProgress.canAdvance || !activePendingResolvedAnswers) return;
    void onRespondToUserInput(activePendingUserInput.requestId, activePendingResolvedAnswers);
  }, [
    activePendingProgress,
    activePendingQuestionIndex,
    activePendingResolvedAnswers,
    activePendingUserInput,
    onRespondToUserInput,
  ]);

  const onPreviousActivePendingUserInputQuestion = useCallback(() => {
    if (!activePendingUserInput || activePendingQuestionIndex <= 0) return;
    setPendingUserInputQuestionIndexByRequestId((existing) => ({
      ...existing,
      [activePendingUserInput.requestId]: activePendingQuestionIndex - 1,
    }));
  }, [activePendingQuestionIndex, activePendingUserInput]);

  const onChangeActivePendingUserInputCustomAnswer = useCallback(
    (
      questionId: string,
      value: string,
      nextCursor: number,
      expandedCursor: number,
      _cursorAdjacentToMention: boolean,
    ) => {
      if (!activePendingUserInput) return;
      promptRef.current = value;
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: {
          ...existing[activePendingUserInput.requestId],
          [questionId]: setPendingUserInputCustomAnswer(
            existing[activePendingUserInput.requestId]?.[questionId],
            value,
          ),
        },
      }));
      const snapshot = composerRef.current?.readSnapshot();
      if (
        snapshot?.value !== value ||
        snapshot.cursor !== nextCursor ||
        snapshot.expandedCursor !== expandedCursor
      ) {
        composerRef.current?.focusAt(nextCursor);
      }
    },
    [activePendingUserInput],
  );

  // Provider model selection
  const keybindings = useServerKeybindings();
  const onProviderModelSelect = useCallback(
    (provider: ProviderKind, model: string) => {
      if (!activeThread) return;
      if (lockedProvider && provider !== lockedProvider) {
        scheduleComposerFocus();
        return;
      }
      const resolvedProvider = resolveThreadKindProvider({
        threadKind: activeThreadKind,
        requestedProvider: provider,
        availableProviders: enabledThreadProviderKinds,
      });
      const resolvedModel = resolveAppModelSelection(
        resolvedProvider,
        settings,
        threadProviderStatuses,
        model,
      );
      const nextModelSelection: ModelSelection = {
        provider: resolvedProvider,
        model: resolvedModel,
      };
      setComposerDraftModelSelection(composerDraftTarget, nextModelSelection);
      setStickyComposerModelSelection(nextModelSelection);
      scheduleComposerFocus();
    },
    [
      activeThread,
      activeThreadKind,
      enabledThreadProviderKinds,
      lockedProvider,
      scheduleComposerFocus,
      setComposerDraftModelSelection,
      setStickyComposerModelSelection,
      threadProviderStatuses,
      settings,
      composerDraftTarget,
    ],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      for (const message of optimisticUserMessagesRef.current) {
        revokeUserMessagePreviewUrls(message);
      }
    };
  }, []);

  // Image expand
  const onExpandTimelineImage = useCallback((preview: ExpandedImagePreview) => {
    setExpandedImage(preview);
  }, []);

  // No-op for diff (chat threads don't have diffs)
  const onOpenTurnDiff = useCallback((_turnId: string, _filePath?: string) => {
    // No diff panel in basic chat
  }, []);

  // No-op for revert (chat threads don't have checkpoints)
  const onRevertUserMessage = useCallback((_messageId: string) => {
    // No checkpoint revert in basic chat
  }, []);

  // No-op stubs for agent-only features
  const onImplementPlanInNewThread = useCallback(() => {}, []);
  const handleInteractionModeChange = useCallback(() => {}, []);
  const handleRuntimeModeChange = useCallback(() => {}, []);
  const toggleInteractionMode = useCallback(() => {}, []);
  const togglePlanSidebar = useCallback(() => {}, []);

  // Empty state
  if (!activeThread) {
    return <NoActiveThreadState />;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
      {/* Top bar */}
      <header
        className={cn(
          "border-b border-border px-3 sm:px-5",
          isElectron
            ? cn(
                "drag-region flex h-[52px] items-center wco:h-[env(titlebar-area-height)]",
                reserveTitleBarControlInset &&
                  "wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
              )
            : "py-2 sm:py-3",
        )}
      >
        <BasicChatHeader
          activeThreadEnvironmentId={activeThread.environmentId}
          activeThreadId={activeThread.id}
          activeThreadTitle={activeThread.title}
        />
      </header>

      {/* Status banners */}
      <ProviderStatusBanner status={activeProviderStatus} />
      <ThreadErrorBanner
        error={activeThread.error}
        onDismiss={() => setThreadError(activeThread.id, null)}
      />

      {/* Main content area — no plan sidebar, no terminal drawer */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Messages */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <MessagesTimeline
            key={activeThread.id}
            isWorking={isWorking}
            activeTurnInProgress={isWorking || !latestTurnSettled}
            activeTurnId={activeLatestTurn?.turnId ?? null}
            activeTurnStartedAt={activeWorkStartedAt}
            listRef={legendListRef}
            timelineEntries={timelineEntries}
            completionDividerBeforeEntryId={completionDividerBeforeEntryId}
            completionSummary={completionSummary}
            turnDiffSummaryByAssistantMessageId={EMPTY_TURN_DIFF_MAP}
            activeThreadEnvironmentId={activeThread.environmentId}
            routeThreadKey={routeThreadKey}
            onOpenTurnDiff={onOpenTurnDiff}
            revertTurnCountByUserMessageId={EMPTY_REVERT_MAP}
            onRevertUserMessage={onRevertUserMessage}
            isRevertingCheckpoint={false}
            onImageExpand={onExpandTimelineImage}
            markdownCwd={undefined}
            resolvedTheme={resolvedTheme}
            timestampFormat={timestampFormat}
            workspaceRoot={undefined}
            onIsAtEndChange={onIsAtEndChange}
          />

          {/* Scroll to bottom pill */}
          {showScrollToBottom && (
            <div className="pointer-events-none absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 justify-center py-1.5">
              <button
                type="button"
                onClick={() => scrollToEnd(true)}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-muted-foreground text-xs shadow-sm transition-colors hover:border-border hover:text-foreground hover:cursor-pointer"
              >
                <ChevronDownIcon className="size-3.5" />
                Scroll to bottom
              </button>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-3 pb-3 pt-1.5 sm:px-5 sm:pb-4 sm:pt-2">
          <ChatComposer
            ref={composerRef}
            composerDraftTarget={composerDraftTarget}
            environmentId={environmentId}
            routeKind="server"
            routeThreadRef={routeThreadRef}
            draftId={null}
            activeThreadId={activeThreadId}
            activeThreadEnvironmentId={activeThread.environmentId}
            activeThread={activeThread}
            isServerThread={isServerThread}
            isLocalDraftThread={false}
            phase={phase}
            isConnecting={isConnecting}
            isSendBusy={isSendBusy}
            isPreparingWorktree={false}
            activePendingApproval={activePendingApproval}
            pendingApprovals={pendingApprovals}
            pendingUserInputs={pendingUserInputs}
            activePendingProgress={activePendingProgress}
            activePendingResolvedAnswers={activePendingResolvedAnswers}
            activePendingIsResponding={activePendingIsResponding}
            activePendingDraftAnswers={activePendingDraftAnswers}
            activePendingQuestionIndex={activePendingQuestionIndex}
            respondingRequestIds={respondingRequestIds}
            showPlanFollowUpPrompt={false}
            activeProposedPlan={null}
            activePlan={null}
            sidebarProposedPlan={null}
            planSidebarLabel="Plan"
            planSidebarOpen={false}
            runtimeMode={runtimeMode}
            interactionMode={interactionMode}
            lockedProvider={lockedProvider}
            providerStatuses={threadProviderStatuses as ServerProvider[]}
            activeProjectDefaultModelSelection={activeProject?.defaultModelSelection}
            activeThreadModelSelection={activeThread.modelSelection}
            activeThreadActivities={activeThread.activities}
            resolvedTheme={resolvedTheme}
            settings={settings}
            keybindings={keybindings}
            terminalOpen={false}
            gitCwd={null}
            promptRef={promptRef}
            composerImagesRef={composerImagesRef}
            composerTerminalContextsRef={composerTerminalContextsRef}
            shouldAutoScrollRef={isAtEndRef}
            scheduleStickToBottom={scrollToEnd}
            onSend={onSend}
            onInterrupt={onInterrupt}
            onImplementPlanInNewThread={onImplementPlanInNewThread}
            onRespondToApproval={onRespondToApproval}
            onSelectActivePendingUserInputOption={onSelectActivePendingUserInputOption}
            onAdvanceActivePendingUserInput={onAdvanceActivePendingUserInput}
            onPreviousActivePendingUserInputQuestion={onPreviousActivePendingUserInputQuestion}
            onChangeActivePendingUserInputCustomAnswer={onChangeActivePendingUserInputCustomAnswer}
            onProviderModelSelect={onProviderModelSelect}
            toggleInteractionMode={toggleInteractionMode}
            handleRuntimeModeChange={handleRuntimeModeChange}
            handleInteractionModeChange={handleInteractionModeChange}
            togglePlanSidebar={togglePlanSidebar}
            focusComposer={focusComposer}
            scheduleComposerFocus={scheduleComposerFocus}
            setThreadError={setThreadError}
            onExpandImage={onExpandTimelineImage}
          />
        </div>
      </div>

      {expandedImage && (
        <ExpandedImageDialog preview={expandedImage} onClose={closeExpandedImage} />
      )}
    </div>
  );
}

// Stable empty references for props that chat threads don't use.
const EMPTY_TURN_DIFF_MAP = new Map();
const EMPTY_REVERT_MAP = new Map();
