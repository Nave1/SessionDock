export type ProviderConfidence = "low" | "medium" | "high";

export interface DeviceContext {
  vendor?: string;
  deviceType?: string;
  model?: string;
}

export interface QuickCommand {
  id: string;
  label: string;
  command: string;
  category: string;
  risk: "read-only";
}

export interface ProviderDiagnostic {
  id: string;
  label: string;
  command: string;
  category: string;
  risk: "read-only";
}

export interface DeviceProvider {
  id: string;
  name: string;
  vendor: string;
  operatingSystem: string;
  version: string;
  quickCommands: readonly QuickCommand[];
  diagnostics: readonly ProviderDiagnostic[];
}

export interface DeviceProviderMatch {
  provider: DeviceProvider;
  confidence: ProviderConfidence;
  source: "configured-metadata" | "fallback";
}

function quickCommand(id: string, label: string, command: string, category: string): QuickCommand {
  return { id, label, command, category, risk: "read-only" };
}

function diagnostic(id: string, label: string, command: string, category: string): ProviderDiagnostic {
  return { id, label, command, category, risk: "read-only" };
}

export const genericSshProvider: DeviceProvider = {
  id: "generic-ssh",
  name: "Generic SSH",
  vendor: "Generic",
  operatingSystem: "Unknown",
  version: "1.0.0",
  quickCommands: [],
  diagnostics: [],
};

export const linuxProvider: DeviceProvider = {
  id: "linux",
  name: "Linux",
  vendor: "Linux",
  operatingSystem: "Linux",
  version: "1.0.0",
  quickCommands: [
    quickCommand("linux-uname", "Kernel and system", "uname -a", "Identity"),
    quickCommand("linux-os-release", "Operating system", "cat /etc/os-release", "Identity"),
    quickCommand("linux-uptime", "Uptime", "uptime", "Health"),
    quickCommand("linux-memory", "Memory usage", "free -h", "Health"),
    quickCommand("linux-filesystems", "Filesystem usage", "df -h", "Health"),
    quickCommand("linux-addresses", "IP addresses", "ip addr", "Network"),
    quickCommand("linux-routes", "IP routes", "ip route", "Network"),
    quickCommand("linux-failed-services", "Failed services", "systemctl --failed", "Services"),
    quickCommand("linux-processes", "Processes", "ps aux", "Processes"),
  ],
  diagnostics: [
    diagnostic("linux-identity", "System identity", "uname -a", "Identity"),
    diagnostic("linux-filesystems", "Filesystem health", "df -h", "Health"),
    diagnostic("linux-network", "Network interfaces", "ip addr", "Network"),
  ],
};

export const aristaEosProvider: DeviceProvider = {
  id: "arista-eos",
  name: "Arista EOS",
  vendor: "Arista",
  operatingSystem: "EOS",
  version: "1.0.0",
  quickCommands: [
    quickCommand("eos-version", "Version", "show version", "Identity"),
    quickCommand("eos-hostname", "Hostname", "show hostname", "Identity"),
    quickCommand("eos-interface-status", "Interface status", "show interfaces status", "Interfaces"),
    quickCommand("eos-interface-errors", "Interface errors", "show interfaces counters errors", "Interfaces"),
    quickCommand("eos-transceivers", "Transceivers", "show interfaces transceiver", "Interfaces"),
    quickCommand("eos-lldp", "LLDP neighbors", "show lldp neighbors", "Discovery"),
    quickCommand("eos-vlans", "VLANs", "show vlan", "Layer 2"),
    quickCommand("eos-mac-table", "MAC address table", "show mac address-table", "Layer 2"),
    quickCommand("eos-port-channel", "Port channels", "show port-channel", "Layer 2"),
    quickCommand("eos-arp", "ARP table", "show arp", "Layer 3"),
    quickCommand("eos-routes", "IP routes", "show ip route", "Layer 3"),
    quickCommand("eos-bgp", "BGP summary", "show ip bgp summary", "Fabric"),
    quickCommand("eos-mlag", "MLAG status", "show mlag", "Fabric"),
    quickCommand("eos-vxlan", "VXLAN VTEPs", "show vxlan vtep", "Fabric"),
    quickCommand("eos-environment", "Environment", "show system environment all", "Health"),
  ],
  diagnostics: [
    diagnostic("eos-platform", "Platform identity", "show version", "Identity"),
    diagnostic("eos-interfaces", "Interface health", "show interfaces status", "Interfaces"),
    diagnostic("eos-routing", "Routing health", "show ip bgp summary", "Fabric"),
  ],
};

export const deviceProviders: readonly DeviceProvider[] = [
  aristaEosProvider,
  linuxProvider,
  genericSshProvider,
];

const aristaVendors = new Set(["arista", "arista networks"]);
const linuxVendors = new Set(["linux", "ubuntu", "debian", "red hat", "rhel", "rocky linux", "almalinux", "suse"]);
const linuxDeviceTypes = new Set(["linux", "linux server"]);

function normalizeMetadata(value?: string): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function selectDeviceProvider(context: DeviceContext): DeviceProviderMatch {
  const vendor = normalizeMetadata(context.vendor);
  const deviceType = normalizeMetadata(context.deviceType);

  if (aristaVendors.has(vendor)) {
    return { provider: aristaEosProvider, confidence: "high", source: "configured-metadata" };
  }
  if (linuxVendors.has(vendor) || linuxDeviceTypes.has(deviceType)) {
    return { provider: linuxProvider, confidence: "high", source: "configured-metadata" };
  }
  return { provider: genericSshProvider, confidence: "low", source: "fallback" };
}