import { MessageSquarePlusIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";

import { usePrimaryEnvironmentId } from "../../environments/primary";
import { useThreadActions } from "../../hooks/useThreadActions";
import { startNewChatThread } from "../../lib/chatThreadActions";
import { sortThreads } from "../../lib/threadSort";
import { useSettings } from "../../hooks/useSettings";
import { selectChatSidebarThreadsAcrossEnvironments, useStore } from "../../store";
import type { SidebarThreadSummary } from "../../types";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { resolveThreadRowClassName } from "../Sidebar.logic";
import { PersonaPicker } from "./PersonaPicker";

interface SidebarChatsSectionProps {
  readonly routeThreadKey: string | null;
}

export const SidebarChatsSection = memo(function SidebarChatsSection({
  routeThreadKey,
}: SidebarChatsSectionProps) {
  const chatThreads = useStore(useShallow(selectChatSidebarThreadsAcrossEnvironments));
  const threadSortOrder = useSettings((s) => s.sidebarThreadSortOrder);
  const visibleChatThreads = useMemo(
    () =>
      sortThreads(
        chatThreads.filter((thread) => thread.archivedAt === null),
        threadSortOrder,
      ),
    [chatThreads, threadSortOrder],
  );
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const navigate = useNavigate();
  const { deleteThread } = useThreadActions();

  const handleNewChat = useCallback(async () => {
    if (!primaryEnvironmentId) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Cannot start chat",
          description: "No active environment is available.",
        }),
      );
      return;
    }
    try {
      const { environmentId, threadId } = await startNewChatThread({
        environmentId: primaryEnvironmentId,
      });
      await navigate({
        to: "/chat/$environmentId/$threadId",
        params: { environmentId, threadId },
      });
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not start chat",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        }),
      );
    }
  }, [navigate, primaryEnvironmentId]);

  return (
    <SidebarGroup className="px-2 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 pl-1 pr-1.5">
        <PersonaPicker />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="New chat"
                data-testid="sidebar-new-chat-button"
                className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => {
                  void handleNewChat();
                }}
              />
            }
          >
            <MessageSquarePlusIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="right">New chat</TooltipPopup>
        </Tooltip>
      </div>

      {visibleChatThreads.length === 0 ? (
        <button
          type="button"
          onClick={() => {
            void handleNewChat();
          }}
          className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
        >
          <SquarePenIcon className="size-3.5" />
          <span>Start a new chat</span>
        </button>
      ) : (
        <SidebarMenu>
          {visibleChatThreads.map((thread) => (
            <SidebarChatThreadRow
              key={scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))}
              thread={thread}
              isActive={
                scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === routeThreadKey
              }
              onDelete={deleteThread}
            />
          ))}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
});

interface SidebarChatThreadRowProps {
  readonly thread: SidebarThreadSummary;
  readonly isActive: boolean;
  readonly onDelete: (target: ScopedThreadRef) => Promise<void>;
}

const SidebarChatThreadRow = memo(function SidebarChatThreadRow(props: SidebarChatThreadRowProps) {
  const { thread, isActive, onDelete } = props;
  const navigate = useNavigate();
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const environmentId = thread.environmentId as EnvironmentId;
  const handleNavigate = useCallback(() => {
    void navigate({
      to: "/chat/$environmentId/$threadId",
      params: { environmentId, threadId: thread.id },
    });
  }, [environmentId, navigate, thread.id]);
  const handleDeleteClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void onDelete(threadRef);
    },
    [onDelete, threadRef],
  );

  return (
    <SidebarMenuItem className="group/menu-sub-item">
      <SidebarMenuButton
        size="sm"
        isActive={isActive}
        className={`${resolveThreadRowClassName({ isActive, isSelected: false })} relative`}
        onClick={handleNavigate}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  data-testid={`chat-thread-title-${thread.id}`}
                >
                  {thread.title}
                </span>
              }
            />
            <TooltipPopup side="top" className="max-w-80 whitespace-normal leading-tight">
              {thread.title}
            </TooltipPopup>
          </Tooltip>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Delete chat"
            className="hidden cursor-pointer rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/menu-sub-item:inline-flex group-focus-within/menu-sub-item:inline-flex"
            onClick={handleDeleteClick}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Trash2Icon className="size-3" />
          </button>
          <span
            className={`text-[10px] transition-opacity duration-150 group-hover/menu-sub-item:opacity-0 group-focus-within/menu-sub-item:opacity-0 ${
              isActive ? "text-foreground/72 dark:text-foreground/82" : "text-muted-foreground/40"
            }`}
          >
            {formatRelativeTimeLabel(
              thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
            )}
          </span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});
