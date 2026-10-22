import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickConnect } from "../components/forms/QuickConnect";
import { SettingsView } from "../components/views/SettingsView";
import { TerminalTabs } from "../components/TerminalTabs";
import { useAppStore, type TerminalTab } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import { useSettingsStore } from "../stores/settingsStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../stores/themeStore", () => ({
  useThemeStore: () => ({
    mode: "dark",
    setMode: vi.fn(),
    accent: "Blue",
    setAccent: vi.fn(),
  }),
}));

const connectedTab: TerminalTab = {
  id: "tab-1",
  sessionId: "session-1",
  sessionName: "Core switch",
  host: "switch.example.test",
  protocol: "ssh",
  status: "connected",
  pinned: false,
};

describe("settings runtime behavior", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSessionStore.setState({ credentials: [] });
    useAppStore.setState({ tabs: [], activeTabId: null });
    useSettingsStore.setState({
      confirmCloseActive: true,
      defaultProtocol: "SSH",
      defaultSshPort: 22,
      defaultTelnetPort: 23,
    });
    vi.unstubAllGlobals();
  });

  it("uses the saved default protocol and port in Quick Connect", () => {
    useSettingsStore.setState({ defaultProtocol: "Telnet", defaultTelnetPort: 2323 });
    const onConnect = vi.fn();
    render(<QuickConnect onConnect={onConnect} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("192.168.1.1 or hostname"), {
      target: { value: "router.example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "session.connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect anyway" }));

    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "telnet",
      port: 2323,
    }));
  });

  it("requires confirmation before closing a connected tab", () => {
    useAppStore.setState({ tabs: [connectedTab], activeTabId: connectedTab.id });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TerminalTabs />);

    fireEvent.click(screen.getByRole("button", { name: "Close Core switch" }));
    expect(useAppStore.getState().tabs).toHaveLength(1);

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Close Core switch" }));
    expect(useAppStore.getState().tabs).toHaveLength(0);
  });

  it("does not advertise unsupported settings", () => {
    render(<SettingsView />);
    expect(screen.queryByText("Restore open tabs on restart")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Security/i }));
    expect(screen.queryByText("Application Lock")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /SSH/i }));
    expect(screen.queryByText("SSH Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("Default timeout (seconds)")).not.toBeInTheDocument();
  });
});