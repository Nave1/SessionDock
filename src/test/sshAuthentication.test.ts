import { describe, expect, it } from "vitest";
import { shouldPromptForPassword } from "../utils/sshAuthentication";

describe("SSH authentication prompts", () => {
  it("prompts only for password methods without an available secret", () => {
    expect(shouldPromptForPassword("ssh", "password")).toBe(true);
    expect(shouldPromptForPassword("ssh", "manual")).toBe(true);
    expect(shouldPromptForPassword("ssh", "password", "ephemeral")).toBe(false);
    expect(shouldPromptForPassword("ssh", "password", undefined, "vault-profile")).toBe(false);
  });

  it("never requests a password for key, agent, or non-SSH connections", () => {
    expect(shouldPromptForPassword("ssh", "private_key")).toBe(false);
    expect(shouldPromptForPassword("ssh", "ssh_agent")).toBe(false);
    expect(shouldPromptForPassword("serial", "password")).toBe(false);
  });
});