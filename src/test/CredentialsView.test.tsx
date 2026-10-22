import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsView } from "../components/views/CredentialsView";
import { useSessionStore } from "../stores/sessionStore";

const mocks = vi.hoisted(() => ({ getSecret: vi.fn(), update: vi.fn() }));

vi.mock("../api/commands", () => ({
  deleteCredential: vi.fn(),
  storeCredential: vi.fn(),
  getCredentialSecret: mocks.getSecret,
  updateCredential: mocks.update,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const profile = {
  id: "credential-1",
  name: "Network admin",
  username: "admin",
  authentication_method: "password" as const,
  vault_reference: "cred_credential-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("CredentialsView", () => {
  beforeEach(() => {
    useSessionStore.setState({ credentials: [profile] });
    mocks.getSecret.mockReset().mockResolvedValue("current-secret");
    mocks.update.mockReset().mockImplementation(async (request) => ({ ...profile, ...request }));
  });

  it("reveals the vault password only on request and updates username and password", async () => {
    render(<CredentialsView />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Network admin" }));

    const password = await screen.findByLabelText("session.password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("");
    expect(mocks.getSecret).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "credentials.showPassword" }));
    await waitFor(() => expect(password).toHaveValue("current-secret"));
    expect(mocks.getSecret).toHaveBeenCalledWith("credential-1");
    expect(password).toHaveAttribute("type", "text");

    fireEvent.change(screen.getByPlaceholderText("admin"), { target: { value: "netops" } });
    fireEvent.change(password, { target: { value: "replacement-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "credentials.update" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: "credential-1",
      username: "netops",
      password: "replacement-secret",
    })));
  });
});