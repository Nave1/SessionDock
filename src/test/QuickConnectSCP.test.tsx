import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickConnect } from "../components/forms/QuickConnect";
import { useSessionStore } from "../stores/sessionStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("Quick Connect SCP", () => {
  afterEach(() => {
    useSessionStore.setState({ credentials: [] });
  });

  it("connects through SSH with the selected vault credential and SCP intent", () => {
    useSessionStore.setState({
      credentials: [{
        id: "credential-1",
        name: "Network admin",
        username: "netadmin",
        authentication_method: "password",
        vault_reference: "vault://credential-1",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }],
    });
    const onConnect = vi.fn();
    render(<QuickConnect onConnect={onConnect} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "SCP" }));
    fireEvent.change(screen.getByLabelText("sshAuth.credentialProfile"), { target: { value: "credential-1" } });
    fireEvent.change(screen.getByPlaceholderText("192.168.1.1 or hostname"), { target: { value: "switch.example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "session.connect" }));

    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "ssh",
      transfer_mode: "scp",
      credential_profile_id: "credential-1",
      username: "netadmin",
      password: "",
    }));
  });
});