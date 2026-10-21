import { describe, expect, it } from "vitest";
import { isEligibleJumpHost, moveJumpHostId } from "../utils/sshJumpHosts";

const candidate = {
  id: "jump-1",
  protocol: "ssh" as const,
  username: "ops",
  authentication_method: "ssh_agent" as const,
};

describe("SSH jump-host editor rules", () => {
  it("requires a usable non-manual authentication configuration", () => {
    expect(isEligibleJumpHost(candidate, undefined, [])).toBe(true);
    expect(isEligibleJumpHost({ ...candidate, authentication_method: "password" }, undefined, [])).toBe(false);
    expect(isEligibleJumpHost({ ...candidate, authentication_method: "password", credential_profile_id: "vault" }, undefined, [])).toBe(true);
    expect(isEligibleJumpHost({ ...candidate, authentication_method: "private_key" }, undefined, [])).toBe(false);
    expect(isEligibleJumpHost({ ...candidate, authentication_method: "private_key", private_key_reference: "C:\\keys\\id_ed25519" }, undefined, [])).toBe(true);
    expect(isEligibleJumpHost({ ...candidate, authentication_method: "manual" }, undefined, [])).toBe(false);
  });

  it("rejects self, selected, non-SSH, and username-less profiles", () => {
    expect(isEligibleJumpHost(candidate, "jump-1", [])).toBe(false);
    expect(isEligibleJumpHost(candidate, undefined, ["jump-1"])).toBe(false);
    expect(isEligibleJumpHost({ ...candidate, protocol: "telnet" }, undefined, [])).toBe(false);
    expect(isEligibleJumpHost({ ...candidate, username: "" }, undefined, [])).toBe(false);
  });

  it("reorders without mutating the original chain", () => {
    const original = ["a", "b", "c"];
    expect(moveJumpHostId(original, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveJumpHostId(original, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveJumpHostId(original, 0, -1)).toBe(original);
    expect(original).toEqual(["a", "b", "c"]);
  });
});