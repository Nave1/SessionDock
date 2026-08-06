import type { Session } from "../../types";
import {
  countTerminalPanes,
  type TerminalPaneNode,
  type TerminalTab,
  useAppStore,
} from "../../stores/appStore";
import { TerminalView } from "./TerminalView";

interface TerminalPaneLayoutProps {
  tab: TerminalTab;
  session?: Session;
}

export function TerminalPaneLayout({ tab, session }: TerminalPaneLayoutProps) {
  const { splitTabPane, closeTabPane, setActivePane } = useAppStore();
  const layout = tab.paneLayout ?? { type: "pane" as const, id: tab.id };
  const paneCount = countTerminalPanes(layout);
  const frames = getPaneFrames(layout);

  return (
    <div className="relative h-full min-h-0 min-w-0 bg-dock-border">
      {frames.map(({ paneId, left, top, width, height }) => {
        const isActive = paneId === (tab.activePaneId ?? tab.id);
        return (
          <div
            key={paneId}
            className={`absolute overflow-hidden bg-dock-bg border border-dock-border outline outline-1 -outline-offset-2 ${isActive && paneCount > 1 ? "outline-dock-accent/70" : "outline-transparent"}`}
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
            onPointerDownCapture={() => setActivePane(tab.id, paneId)}
          >
            <TerminalView
              tabId={paneId}
              statusTabId={tab.id}
              host={tab.host}
              port={tab.port ?? session?.port ?? (tab.protocol === "ssh" ? 22 : 23)}
              protocol={tab.protocol}
              username={tab.username ?? session?.username}
              password={tab.password}
              keepaliveInterval={session?.keepalive_interval ?? 60}
              canSplit={paneCount < 4}
              canClosePane={paneCount > 1}
              onSplitRight={() => splitTabPane(tab.id, paneId, "horizontal")}
              onSplitDown={() => splitTabPane(tab.id, paneId, "vertical")}
              onClosePane={() => closeTabPane(tab.id, paneId)}
              reconnectToken={tab.reconnectPaneId === paneId ? tab.reconnectToken : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

interface PaneFrame {
  paneId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

function getPaneFrames(
  node: TerminalPaneNode,
  left = 0,
  top = 0,
  width = 100,
  height = 100,
): PaneFrame[] {
  if (node.type === "pane") return [{ paneId: node.id, left, top, width, height }];
  if (node.direction === "horizontal") {
    return [
      ...getPaneFrames(node.children[0], left, top, width / 2, height),
      ...getPaneFrames(node.children[1], left + width / 2, top, width / 2, height),
    ];
  }
  return [
    ...getPaneFrames(node.children[0], left, top, width, height / 2),
    ...getPaneFrames(node.children[1], left, top + height / 2, width, height / 2),
  ];
}