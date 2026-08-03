import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "../utils/encryptedBackup";

describe("encrypted backups", () => {
  it("round-trips SessionDock export data", async () => {
    const content = JSON.stringify({ application: "SessionDock", sessions: [{ name: "Switch" }] });
    const encrypted = await encryptBackup(content, "correct horse battery staple");

    expect(encrypted).not.toContain("Switch");
    await expect(decryptBackup(encrypted, "correct horse battery staple")).resolves.toBe(content);
  });

  it("rejects an incorrect password", async () => {
    const encrypted = await encryptBackup("private data", "right-password");
    await expect(decryptBackup(encrypted, "wrong-password")).rejects.toThrow("incorrect");
  });

  it("rejects invalid backup files", async () => {
    await expect(decryptBackup('{"application":"SessionDock"}', "password")).rejects.toThrow("valid");
  });
});