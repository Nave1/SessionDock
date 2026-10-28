import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainContent } from "../components/MainContent";
import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";

vi.mock("../components/TerminalTabs", () => ({ TerminalTabs: () => <div>terminal-tabs</div> }));
vi.mock("../components/terminal/TerminalPaneLayout", () => ({ TerminalPaneLayout: () => <div data-testid="terminal-pane" /> }));
vi.mock("../components/views/SessionList", () => ({ SessionList: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("../components/views/HomeView", () => ({ HomeView: () => <div>home-view</div> }));
vi.mock("../components/views/SettingsView", () => ({ SettingsView: () => null }));
vi.mock("../components/views/CredentialsView", () => ({ CredentialsView: () => null }));
vi.mock("../components/views/SessionGroupView", () => ({ SessionGroupView: () => null }));
vi.mock("../components/views/ActiveConnectionsView", () => ({ ActiveConnectionsView: () => null }));
vi.mock("../components/views/TransfersView", () => ({ TransfersView: () => null }));
vi.mock("../components/views/TunnelsView", () => ({ TunnelsView: () => null }));
vi.mock("../components/views/DiagnosticsView", () => ({ DiagnosticsView: () => null }));
vi.mock("../components/bmc/BmcConsoleView", () => ({ BmcConsoleView: () => null }));
vi.mock("../components/vnc/VncViewerView", () => ({ VncViewerView: () => null }));

const props = {
  onNewSession: vi.fn(),
  onNewFolder: vi.fn(),
  onQuickConnect: vi.fn(),
  onImport: vi.fn(),
  onScpSession: vi.fn(),
};

describe("MainContent", () => {
  beforeEach(() => {
    useSessionStore.setState({ sessions: [] });
    useAppStore.setState({
      currentView: "recent",
      activeTabId: "tab-1",
      tabs: [{
        id: "tab-1",
        sessionId: "session-1",
        sessionName: "Core switch",
        host: "192.0.2.10",
        protocol: "ssh",
        status: "connected",
        pinned: false,
      }],
    });
  });

  it.each([
    ["favorites", "Favorites"],
    ["recent", "Recent Sessions"],
    ["allSessions", "All Sessions"],
  ] as const)("shows %s instead of an open terminal when selected", (currentView, title) => {
    useAppStore.setState({ currentView });
    render(<MainContent {...props} />);

    expect(screen.getByText(title).parentElement).not.toHaveClass("hidden");
    expect(screen.getByTestId("terminal-pane").parentElement).toHaveClass("hidden");
  });

  it("shows the open terminal only in terminal view", () => {
    useAppStore.setState({ currentView: "terminal" });
    render(<MainContent {...props} />);

    expect(screen.getByTestId("terminal-pane").parentElement).toHaveClass("z-10");
  });
});