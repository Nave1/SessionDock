import { useAppStore } from "../stores/appStore";
import { X, Pin } from "lucide-react";

export function TerminalTabs() {
  const { tabs, activeTabId, setActiveTab, removeTab, setCurrentView } = useAppStore();

  return (
    <div className="flex items-center h-9 bg-dock-sidebar border-b border-dock-border overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => { setActiveTab(tab.id); setCurrentView("recent"); }}
          className={`group flex items-center gap-1.5 px-3 h-full text-xs border-r border-dock-border cursor-pointer transition-colors ${
            activeTabId === tab.id
              ? "bg-dock-bg text-dock-text border-b-2 border-b-dock-accent"
              : "text-dock-text-muted hover:text-dock-text hover:bg-dock-surface"
          }`}
        >
          {/* Status dot */}
          <StatusDot status={tab.status} />

          {/* Tab label */}
          <span className="truncate max-w-[120px]">{tab.sessionName}</span>
          <span className="text-[10px] text-dock-text-muted">{tab.host}</span>

          {/* Pin indicator */}
          {tab.pinned && <Pin size={10} className="text-dock-text-muted" />}

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeTab(tab.id);
            }}
            className="opacity-0 group-hover:opacity-100 hover:text-dock-error transition-opacity ml-1"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = {
    connected: "bg-dock-success",
    connecting: "bg-dock-warning animate-pulse",
    disconnected: "bg-dock-text-muted",
    error: "bg-dock-error",
    auth_failed: "bg-dock-error",
    timeout: "bg-dock-warning",
    host_key_warning: "bg-dock-warning",
    reconnecting: "bg-dock-warning animate-pulse",
    idle: "bg-dock-text-muted",
  }[status] ?? "bg-dock-text-muted";

  return <div className={`w-1.5 h-1.5 rounded-full ${color}`} />;
}
