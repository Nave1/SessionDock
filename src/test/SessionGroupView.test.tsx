import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionGroupView } from "../components/views/SessionGroupView";
import { useAppStore } from "../stores/appStore";
import { useSessionStore } from "../stores/sessionStore";
import type { Session } from "../types";

const api = vi.hoisted(() => ({
  deleteSessionGroup: vi.fn(),
  getSessionGroupMembers: vi.fn(),
  setSessionGroupMembers: vi.fn(),
  updateSessionGroup: vi.fn(),
}));
const i18n = vi.hoisted(() => ({
  t: (key: string, values?: { count?: number; name?: string }) => values?.count === undefined
    ? key
    : `${key}:${values.count}`,
}));

vi.mock("../api/commands", () => api);
vi.mock("zustand/middleware", () => ({
  persist: (initializer: unknown) => initializer,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => i18n,
}));

const session = (id: string, name: string): Session => ({
  id,
  name,
  host: `${id}.example.test`,
  port: 22,
  protocol: "ssh",
  username: "operator",
  authentication_method: "password",
  jump_host_ids: [],
  favorite: false,
  connection_timeout: 30,
  keepalive_interval: 60,
  created_at: "2026-10-19T00:00:00Z",
  updated_at: "2026-10-19T00:00:00Z",
  connection_count: 0,
  bmc_use_https: true,
  bmc_viewer_mode: "web",
  bmc_ignore_tls_errors: false,
  bmc_open_console_automatically: false,
  bmc_open_fullscreen: false,
  bmc_timeout_seconds: 30,
  bmc_redfish_enabled: true,
  bmc_cookie_persistence: "application",
});

describe("SessionGroupView", () => {
  beforeEach(() => {
    api.getSessionGroupMembers.mockReset().mockResolvedValue(["session-1"]);
    api.setSessionGroupMembers.mockReset().mockResolvedValue({
      id: "group-1",
      name: "Core",
      member_count: 2,
      created_at: "2026-10-19T00:00:00Z",
      updated_at: "2026-10-19T00:00:00Z",
    });
    useAppStore.setState({
      tabs: [],
      activeTabId: null,
      currentView: "group",
      selectedGroupId: "group-1",
    });
    useSessionStore.setState({
      sessions: [session("session-1", "Core 1"), session("session-2", "Core 2")],
      groups: [{
        id: "group-1",
        name: "Core",
        member_count: 1,
        created_at: "2026-10-19T00:00:00Z",
        updated_at: "2026-10-19T00:00:00Z",
      }],
    });
  });

  it("loads members and connects the visible group", async () => {
    render(<SessionGroupView />);

    expect(await screen.findByText("Core 1")).toBeInTheDocument();
    expect(screen.queryByText("Core 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "groups.connectAll" }));

    expect(useAppStore.getState().tabs).toHaveLength(1);
    expect(useAppStore.getState().tabs[0].sessionId).toBe("session-1");
    expect(useAppStore.getState().currentView).toBe("recent");
  });

  it("saves changed membership", async () => {
    render(<SessionGroupView />);
    await screen.findByText("Core 1");
    fireEvent.click(screen.getByRole("button", { name: "groups.manage" }));
    fireEvent.click(screen.getAllByRole("checkbox", { name: "groups.toggleMembership" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "groups.saveMembers" }));

    await waitFor(() => expect(api.setSessionGroupMembers).toHaveBeenCalledTimes(1));
    expect(api.setSessionGroupMembers).toHaveBeenCalledWith(
      "group-1",
      expect.arrayContaining(["session-1", "session-2"]),
    );
    expect(useSessionStore.getState().groups[0].member_count).toBe(2);
  });
});