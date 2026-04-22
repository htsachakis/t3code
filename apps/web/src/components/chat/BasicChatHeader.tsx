import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { memo } from "react";
import { SidebarTrigger } from "../ui/sidebar";

interface BasicChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  activeThreadTitle: string;
}

export const BasicChatHeader = memo(function BasicChatHeader({
  activeThreadTitle,
}: BasicChatHeaderProps) {
  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <h2
          className="min-w-0 shrink truncate text-sm font-medium text-foreground"
          title={activeThreadTitle}
        >
          {activeThreadTitle}
        </h2>
      </div>
    </div>
  );
});
