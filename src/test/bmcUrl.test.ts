import { describe, expect, it } from "vitest";
import {
  hasSensitiveUrlParameters,
  normalizeBmcUrl,
  redactSensitiveUrl,
  safePersistedBmcUrl,
} from "../utils/bmcUrl";

describe("BMC URL security", () => {
  it("normalizes host, port, and path", () => {
    expect(normalizeBmcUrl({ host: "idrac.lab", port: 8443, path: "console" }))
      .toBe("https://idrac.lab:8443/console");
  });

  it("supports unbracketed IPv6 hosts", () => {
    expect(normalizeBmcUrl({ host: "2001:db8::10", port: 443 }))
      .toBe("https://[2001:db8::10]/");
  });

  it("rejects unsupported schemes and embedded credentials", () => {
    expect(() => normalizeBmcUrl("javascript:alert(1)")).toThrow(/HTTP or HTTPS/);
    expect(() => normalizeBmcUrl("https://admin:secret@bmc.lab/")).toThrow(/credentials/);
  });

  it("detects and redacts sensitive parameters case-insensitively", () => {
    const url = "https://bmc.lab/console?Token=secret&lang=en";
    expect(hasSensitiveUrlParameters(url)).toBe(true);
    expect(redactSensitiveUrl(url)).toBe("https://bmc.lab/console?Token=%5BREDACTED%5D&lang=en");
  });

  it("omits sensitive console URLs from persistence", () => {
    expect(safePersistedBmcUrl("https://bmc.lab/console?ticket=secret")).toBeUndefined();
    expect(safePersistedBmcUrl("https://bmc.lab/console?lang=en"))
      .toBe("https://bmc.lab/console?lang=en");
  });
});