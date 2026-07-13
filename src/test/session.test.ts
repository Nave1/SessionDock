import { describe, it, expect } from "vitest";

// Session validation logic
function validateSessionName(name: string): string | null {
  if (!name || name.trim().length === 0) return "Session name is required";
  if (name.trim().length > 200) return "Session name too long";
  return null;
}

function validateHost(host: string, protocol: string): string | null {
  if (protocol === "serial") return null;
  if (!host || host.trim().length === 0) return "Host is required";
  if (host.length > 255) return "Host too long";
  return null;
}

function validatePort(port: number, protocol: string): string | null {
  if (protocol === "serial") return null;
  if (port < 1 || port > 65535) return "Port must be between 1 and 65535";
  return null;
}

function validateIpAddress(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  const parts = ip.split(".").map(Number);
  return parts.every((p) => p >= 0 && p <= 255);
}

function validateHostname(hostname: string): boolean {
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return hostnameRegex.test(hostname) && hostname.length <= 253;
}

describe("Session Validation", () => {
  describe("validateSessionName", () => {
    it("rejects empty name", () => {
      expect(validateSessionName("")).toBe("Session name is required");
      expect(validateSessionName("  ")).toBe("Session name is required");
    });

    it("accepts valid names", () => {
      expect(validateSessionName("Core-Switch-01")).toBeNull();
      expect(validateSessionName("Lab Router")).toBeNull();
      expect(validateSessionName("מתג ראשי")).toBeNull(); // Hebrew
    });

    it("rejects overly long names", () => {
      expect(validateSessionName("a".repeat(201))).toBe("Session name too long");
    });
  });

  describe("validateHost", () => {
    it("requires host for SSH and Telnet", () => {
      expect(validateHost("", "ssh")).toBe("Host is required");
      expect(validateHost("", "telnet")).toBe("Host is required");
    });

    it("allows empty host for serial", () => {
      expect(validateHost("", "serial")).toBeNull();
    });

    it("accepts valid hosts", () => {
      expect(validateHost("192.168.1.1", "ssh")).toBeNull();
      expect(validateHost("switch-01.lab.local", "ssh")).toBeNull();
    });
  });

  describe("validatePort", () => {
    it("rejects invalid ports", () => {
      expect(validatePort(0, "ssh")).toBe("Port must be between 1 and 65535");
      expect(validatePort(70000, "ssh")).toBe("Port must be between 1 and 65535");
      expect(validatePort(-1, "ssh")).toBe("Port must be between 1 and 65535");
    });

    it("accepts valid ports", () => {
      expect(validatePort(22, "ssh")).toBeNull();
      expect(validatePort(23, "telnet")).toBeNull();
      expect(validatePort(2222, "ssh")).toBeNull();
      expect(validatePort(65535, "ssh")).toBeNull();
    });

    it("skips validation for serial", () => {
      expect(validatePort(0, "serial")).toBeNull();
    });
  });

  describe("validateIpAddress", () => {
    it("validates correct IPv4", () => {
      expect(validateIpAddress("192.168.1.1")).toBe(true);
      expect(validateIpAddress("10.0.0.1")).toBe(true);
      expect(validateIpAddress("255.255.255.255")).toBe(true);
      expect(validateIpAddress("0.0.0.0")).toBe(true);
    });

    it("rejects invalid IPs", () => {
      expect(validateIpAddress("256.1.1.1")).toBe(false);
      expect(validateIpAddress("192.168.1")).toBe(false);
      expect(validateIpAddress("not-an-ip")).toBe(false);
      expect(validateIpAddress("")).toBe(false);
      expect(validateIpAddress("192.168.1.1.1")).toBe(false);
    });
  });

  describe("validateHostname", () => {
    it("validates correct hostnames", () => {
      expect(validateHostname("switch-01")).toBe(true);
      expect(validateHostname("core-rtr.lab.local")).toBe(true);
      expect(validateHostname("device1")).toBe(true);
    });

    it("rejects invalid hostnames", () => {
      expect(validateHostname("-bad-start")).toBe(false);
      expect(validateHostname("")).toBe(false);
      expect(validateHostname("a".repeat(254))).toBe(false);
    });
  });
});

describe("Search Ranking", () => {
  function rankResult(query: string, name: string, host: string): number {
    const q = query.toLowerCase();
    let score = 0;

    // Exact host match (IP) gets highest priority
    if (host.toLowerCase() === q) score += 100;
    // Exact name match
    else if (name.toLowerCase() === q) score += 90;
    // Name starts with query
    else if (name.toLowerCase().startsWith(q)) score += 70;
    // Host starts with query (partial IP)
    else if (host.toLowerCase().startsWith(q)) score += 60;
    // Name contains query
    else if (name.toLowerCase().includes(q)) score += 40;
    // Host contains query (partial IP match)
    else if (host.toLowerCase().includes(q)) score += 50;

    return score;
  }

  it("ranks exact IP match highest", () => {
    const ipScore = rankResult("192.168.1.1", "Switch", "192.168.1.1");
    const nameScore = rankResult("192.168.1.1", "192.168.1.1-device", "10.0.0.1");
    expect(ipScore).toBeGreaterThan(nameScore);
  });

  it("ranks exact name match highly", () => {
    const exactScore = rankResult("Core-Switch", "Core-Switch", "10.0.0.1");
    const partialScore = rankResult("Core-Switch", "Core-Switch-01", "10.0.0.2");
    expect(exactScore).toBeGreaterThan(partialScore);
  });

  it("supports partial IP search", () => {
    const score = rankResult("192.168", "Some Switch", "192.168.1.1");
    expect(score).toBeGreaterThan(0);
  });

  it("case-insensitive matching", () => {
    const upper = rankResult("SWITCH", "switch-01", "10.0.0.1");
    const lower = rankResult("switch", "switch-01", "10.0.0.1");
    expect(upper).toBe(lower);
  });
});

describe("Folder Hierarchy", () => {
  interface FolderNode {
    id: string;
    name: string;
    parent_id: string | null;
  }

  function buildPath(folders: FolderNode[], folderId: string): string {
    const parts: string[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = folders.find((f) => f.id === currentId);
      if (!folder) break;
      parts.unshift(folder.name);
      currentId = folder.parent_id;
    }

    return parts.join(" / ");
  }

  function detectCircular(folders: FolderNode[], folderId: string, newParentId: string): boolean {
    let currentId: string | null = newParentId;
    while (currentId) {
      if (currentId === folderId) return true;
      const folder = folders.find((f) => f.id === currentId);
      if (!folder) break;
      currentId = folder.parent_id;
    }
    return false;
  }

  const testFolders: FolderNode[] = [
    { id: "1", name: "Data Center", parent_id: null },
    { id: "2", name: "Spine", parent_id: "1" },
    { id: "3", name: "Leaf", parent_id: "1" },
    { id: "4", name: "Rack-A", parent_id: "3" },
  ];

  it("builds correct folder path", () => {
    expect(buildPath(testFolders, "4")).toBe("Data Center / Leaf / Rack-A");
    expect(buildPath(testFolders, "2")).toBe("Data Center / Spine");
    expect(buildPath(testFolders, "1")).toBe("Data Center");
  });

  it("detects circular references", () => {
    expect(detectCircular(testFolders, "1", "4")).toBe(true); // 4 → 3 → 1
    expect(detectCircular(testFolders, "1", "2")).toBe(true); // 2 → 1
    expect(detectCircular(testFolders, "3", "2")).toBe(false); // 2 → 1, doesn't reach 3
  });
});
