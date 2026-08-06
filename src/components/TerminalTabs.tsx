import { useAppStore } from "../stores/appStore";
import { X, RotateCw } from "lucide-react";

export function TerminalTabs() {
  const { tabs, activeTabId, setActiveTab, removeTab, setCurrentView, requestTabReconnect } = useAppStore();

  return (
    <div className="flex items-center h-[38px] bg-dock-sidebar border-b border-dock-border overflow-x-auto flex-shrink-0">
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        return (
          <div
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setCurrentView("recent"); }}
            className={`group relative flex items-center gap-2 px-3.5 h-full text-[12px] cursor-pointer select-none border-r border-dock-border ${
              isActive
                ? "bg-dock-bg text-dock-text"
                : "text-dock-text-muted hover:text-dock-text hover:bg-dock-surface"
            }`}
          >
            {/* Active indicator */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-dock-accent" />
            )}

            {/* Status dot */}
            <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${
              tab.status === "connected" ? "bg-emerald-400" :
              tab.status === "connecting" ? "bg-amber-400 animate-pulse-dot" :
              tab.status === "disconnected" ? "bg-zinc-500" :
              tab.status === "error" || tab.status === "auth_failed" ? "bg-red-400" :
              "bg-zinc-600"
            }`} />

            {/* Label */}
            <span className="truncate max-w-[100px] font-medium">{tab.sessionName}</span>
            <span className="text-[10px] text-dock-text-muted truncate max-w-[80px]">{tab.host}</span>

            {/* Reconnect (on hover, if disconnected) */}
            {tab.status === "disconnected" && (
              <button
                onClick={(e) => { e.stopPropagation(); requestTabReconnect(tab.id); }}
                className="opacity-0 group-hover:opacity-100 text-dock-text-muted hover:text-dock-accent"
                title="Reconnect"
                aria-label={`Reconnect ${tab.sessionName}`}
              >
                <RotateCw size={10} />
              </button>
            )}

            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
              className="opacity-0 group-hover:opacity-100 text-dock-text-muted hover:text-red-400 ml-1"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
