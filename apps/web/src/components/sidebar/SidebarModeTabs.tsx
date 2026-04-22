import { memo } from "react";
import { MessageSquareIcon, SquareTerminalIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { SidebarGroup } from "../ui/sidebar";

export type SidebarMode = "agent" | "chat";

interface SidebarModeTabsProps {
  readonly mode: SidebarMode;
  readonly onModeChange: (mode: SidebarMode) => void;
}

const TAB_DEFINITIONS: ReadonlyArray<{
  readonly mode: SidebarMode;
  readonly label: string;
  readonly icon: typeof SquareTerminalIcon;
  readonly testId: string;
}> = [
  { mode: "agent", label: "Agent", icon: SquareTerminalIcon, testId: "sidebar-tab-agent" },
  { mode: "chat", label: "Chat", icon: MessageSquareIcon, testId: "sidebar-tab-chat" },
];

export const SidebarModeTabs = memo(function SidebarModeTabs({
  mode,
  onModeChange,
}: SidebarModeTabsProps) {
  return (
    <SidebarGroup className="px-2 pt-0 pb-1">
      <div
        role="tablist"
        aria-label="Sidebar section"
        className="flex w-full items-center gap-0.5 rounded-md bg-muted/40 p-0.5"
      >
        {TAB_DEFINITIONS.map(({ mode: tabMode, label, icon: Icon, testId }) => {
          const isActive = tabMode === mode;
          return (
            <button
              key={tabMode}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={testId}
              onClick={() => {
                if (!isActive) onModeChange(tabMode);
              }}
              className={cn(
                "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium outline-hidden transition-colors focus-visible:ring-1 focus-visible:ring-ring",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/70 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </SidebarGroup>
  );
});
