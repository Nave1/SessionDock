/**
 * Generates fake seed data for development and testing.
 * Uses only fictitious data — no real company info, IPs, or credentials.
 */

import type { Session, Folder } from "../types";

const VENDORS = ["Cisco", "Juniper", "Arista", "HP", "Dell", "Fortinet", "Palo Alto", "MikroTik", "Ubiquiti", "Huawei"];
const DEVICE_TYPES = ["Switch", "Router", "Firewall", "Server", "AP", "Console Server", "PDU", "Load Balancer"];
const MODELS_MAP: Record<string, string[]> = {
  Cisco: ["C9300", "C9500", "ASR9000", "Nexus 9K", "ISR4000"],
  Juniper: ["EX4300", "QFX5100", "MX240", "SRX345"],
  Arista: ["7050X", "7280R", "7500R"],
  HP: ["5940", "5130", "FlexFabric"],
  Dell: ["S5248", "Z9264", "N3048"],
  Fortinet: ["FG-100F", "FG-600E", "FG-3000F"],
  "Palo Alto": ["PA-850", "PA-5200", "PA-7000"],
  MikroTik: ["CCR2004", "CRS326", "RB5009"],
  Ubiquiti: ["USW-Pro-48", "USW-Enterprise", "EdgeRouter"],
  Huawei: ["S5720", "CE6800", "AR6000"],
};

const FOLDER_STRUCTURES = [
  { name: "Data Center Alpha", children: ["Spine", "Leaf", "Management", "Compute", "Storage"] },
  { name: "Data Center Beta", children: ["Core", "Distribution", "Access", "DMZ"] },
  { name: "Branch Offices", children: ["New York", "London", "Tokyo", "Sydney", "Berlin"] },
  { name: "Lab Environment", children: ["Dev Lab", "QA Lab", "Performance Lab", "Staging"] },
  { name: "Cloud Infrastructure", children: ["AWS", "Azure", "GCP", "On-Prem Gateway"] },
];

const TAGS = [
  "production", "staging", "development", "critical", "monitoring",
  "backup", "legacy", "new-deploy", "maintenance", "high-bandwidth",
  "encrypted", "console-only", "out-of-band", "spine", "leaf",
];

function randomIP(subnet: string): string {
  const parts = subnet.split(".");
  const host = Math.floor(Math.random() * 254) + 1;
  return `${parts[0]}.${parts[1]}.${parts[2]}.${host}`;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSubset<T>(arr: T[], maxCount: number): T[] {
  const count = Math.floor(Math.random() * maxCount) + 1;
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function generateSeedData(sessionCount: number = 100): {
  sessions: Session[];
  folders: Folder[];
  sessionTags: Map<string, string[]>;
} {
  const folders: Folder[] = [];
  const sessions: Session[] = [];
  const sessionTags = new Map<string, string[]>();

  // Create folder structure
  let folderIndex = 0;
  for (const structure of FOLDER_STRUCTURES) {
    const parentId = `folder-${folderIndex++}`;
    folders.push({
      id: parentId,
      name: structure.name,
      sort_order: folders.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    for (const child of structure.children) {
      folders.push({
        id: `folder-${folderIndex++}`,
        name: child,
        parent_id: parentId,
        sort_order: folders.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Subnets for realistic-looking (but fake) addresses
  const subnets = [
    "10.1.1", "10.1.2", "10.1.3", "10.2.1", "10.2.2",
    "172.16.1", "172.16.2", "172.16.3", "172.16.10", "172.16.20",
    "192.168.100", "192.168.101", "192.168.200", "192.168.201",
  ];

  // Generate sessions
  for (let i = 0; i < sessionCount; i++) {
    const vendor = randomElement(VENDORS);
    const deviceType = randomElement(DEVICE_TYPES);
    const models = MODELS_MAP[vendor] || ["Unknown"];
    const model = randomElement(models);
    const subnet = randomElement(subnets);
    const ip = randomIP(subnet);
    const protocol = Math.random() > 0.15 ? "ssh" as const : Math.random() > 0.5 ? "telnet" as const : "serial" as const;
    const folder = randomElement(folders);

    const paddedIndex = String(i + 1).padStart(3, "0");
    const name = `${vendor}-${deviceType}-${paddedIndex}`;

    const session: Session = {
      id: `session-${i}`,
      name,
      host: protocol === "serial" ? "" : ip,
      port: protocol === "ssh" ? 22 : protocol === "telnet" ? 23 : 0,
      protocol,
      username: randomElement(["admin", "netops", "readonly", "automation"]),
      authentication_method: protocol === "ssh" ? randomElement(["password", "private_key"]) : "password",
      folder_id: folder.id,
      device_type: deviceType,
      vendor,
      model,
      description: `${vendor} ${model} in ${folder.name}`,
      favorite: Math.random() > 0.85,
      connection_timeout: 30,
      keepalive_interval: 60,
      connection_count: Math.floor(Math.random() * 100),
      created_at: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      last_connected_at: Math.random() > 0.3
        ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      bmc_use_https: true,
      bmc_viewer_mode: "web",
      bmc_ignore_tls_errors: false,
      bmc_open_console_automatically: false,
      bmc_open_fullscreen: false,
      bmc_timeout_seconds: 30,
      bmc_redfish_enabled: true,
      bmc_cookie_persistence: "application",
    };

    sessions.push(session);
    sessionTags.set(session.id, randomSubset(TAGS, 3));
  }

  return { sessions, folders, sessionTags };
}
