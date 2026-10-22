import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionList } from "../components/views/SessionList";
import type { Session } from "../types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const session = {
  id: "ssh-1", name: "Core switch", host: "192.0.2.1", port: 22, protocol: "ssh",
  authentication_method: "password", jump_host_ids: [], favorite: false, connection_timeout: 30,
  keepalive_interval: 60, connection_count: 0, created_at: "2026-01-01", updated_at: "2026-01-01",
  bmc_use_https: true, bmc_viewer_mode: "web", bmc_ignore_tls_errors: false,
  bmc_open_console_automatically: false, bmc_open_fullscreen: false, bmc_timeout_seconds: 30,
  bmc_redfish_enabled: true, bmc_cookie_persistence: "application",
} satisfies Session;

describe("SessionList SCP action", () => {
  it("starts SCP setup for an SSH session", () => {
    const onScpConnect = vi.fn();
    render(<SessionList sessions={[session]} title="All Sessions" onConnect={vi.fn()} onScpConnect={onScpConnect} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect to Core switch with SCP" }));
    expect(onScpConnect).toHaveBeenCalledWith(session);
  });
});