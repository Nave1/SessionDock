import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FolderTree } from "../components/tree/FolderTree";
import type { Session } from "../types";

const session: Session = {
  id: "session-1",
  name: "Lab switch",
  host: "192.0.2.10",
  port: 22,
  protocol: "ssh",
  authentication_method: "password",
  jump_host_ids: [],
  favorite: false,
  connection_timeout: 30,
  keepalive_interval: 60,
  connection_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  bmc_use_https: true,
  bmc_viewer_mode: "web",
  bmc_ignore_tls_errors: false,
  bmc_open_console_automatically: false,
  bmc_open_fullscreen: false,
  bmc_timeout_seconds: 30,
  bmc_redfish_enabled: true,
  bmc_cookie_persistence: "application",
};

describe("FolderTree session deletion", () => {
  it("exposes a compact delete action for unfiled sessions", () => {
    const onDeleteSession = vi.fn();
    render(
      <FolderTree
        folders={[]}
        sessions={[session]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        onSelectSession={vi.fn()}
        onDeleteSession={onDeleteSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Lab switch" }));

    expect(onDeleteSession).toHaveBeenCalledWith(session);
  });

  it("offers delete from the session context menu", () => {
    const onDeleteSession = vi.fn();
    render(
      <FolderTree
        folders={[]}
        sessions={[session]}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        onSelectSession={vi.fn()}
        onDeleteSession={onDeleteSession}
      />,
    );

    fireEvent.contextMenu(screen.getByText("Lab switch"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete session" }));

    expect(onDeleteSession).toHaveBeenCalledWith(session);
  });
});