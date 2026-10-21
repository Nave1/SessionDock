import { describe, expect, it } from "vitest";
import {
  aristaEosProvider,
  genericSshProvider,
  linuxProvider,
  selectDeviceProvider,
} from "../device/providers";

describe("device provider registry", () => {
  it("uses configured Arista metadata with high confidence", () => {
    expect(selectDeviceProvider({ vendor: " Arista ", deviceType: "Switch" })).toEqual({
      provider: aristaEosProvider,
      confidence: "high",
      source: "configured-metadata",
    });
  });

  it("recognizes explicit Linux metadata without treating every server as Linux", () => {
    expect(selectDeviceProvider({ deviceType: "Linux Server" }).provider).toBe(linuxProvider);
    expect(selectDeviceProvider({ deviceType: "Server" }).provider).toBe(genericSshProvider);
  });

  it("falls back for unknown vendors instead of guessing", () => {
    expect(selectDeviceProvider({ vendor: "Cisco", deviceType: "Switch" })).toEqual({
      provider: genericSshProvider,
      confidence: "low",
      source: "fallback",
    });
  });

  it("exposes only explicitly read-only quick commands", () => {
    for (const provider of [aristaEosProvider, linuxProvider]) {
      expect(provider.quickCommands.length).toBeGreaterThan(0);
      expect(provider.quickCommands.every((command) => command.risk === "read-only")).toBe(true);
      expect(provider.diagnostics.length).toBeGreaterThan(0);
      expect(provider.diagnostics.every((diagnostic) => diagnostic.risk === "read-only")).toBe(true);
    }
  });

  it("keeps diagnostic IDs aligned with the backend allowlist", () => {
    expect(aristaEosProvider.diagnostics.map((diagnostic) => diagnostic.id)).toEqual([
      "eos-platform",
      "eos-interfaces",
      "eos-routing",
    ]);
    expect(linuxProvider.diagnostics.map((diagnostic) => diagnostic.id)).toEqual([
      "linux-identity",
      "linux-filesystems",
      "linux-network",
    ]);
  });
});