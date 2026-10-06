---
name: sessiondock-device-provider
description: Architecture and implementation rules for SessionDock Device Intelligence providers.
---

# SessionDock Device Provider Skill

## Product Goal

Device Intelligence is a core SessionDock differentiator.

SessionDock should understand infrastructure, not merely connect to it.

This skill governs:

- device providers
- detection
- quick commands
- parsers
- diagnostics
- structured results
- contextual actions
- device comparison

## Architecture

Do not hard-code vendor logic into terminal components.

Use a provider registry.

Conceptual provider interface:

DeviceProvider

- id
- vendor
- operatingSystem
- supportedDeviceTypes
- detectionRules
- quickCommands
- diagnostics
- parsers
- contextualActions

Initial provider families:

- Generic SSH
- Linux
- Arista EOS
- Cisco IOS
- Cisco NX-OS
- Juniper Junos
- Dell iDRAC
- HPE iLO
- Lenovo XClarity
- Supermicro BMC

## Provider Rules

Every provider must:

1. Have a stable identifier.
2. Declare supported device types.
3. Define conservative detection rules.
4. Keep read-only commands separate from modifying actions.
5. Expose raw command output.
6. Use deterministic parsers.
7. Handle unsupported versions gracefully.
8. Include fixtures/tests.

## Detection

Prefer passive signals:

- configured metadata
- SSH banner
- prompt characteristics
- known server metadata
- Redfish metadata

If active detection is required:

- only use clearly read-only commands
- execute the minimum necessary command
- disclose that detection is occurring
- never enter configuration mode
- never request privilege escalation automatically

Return confidence:

- low
- medium
- high

Allow manual override.

Manual override must take precedence.

## Quick Commands

Quick Commands are transparent helpers.

Every quick action must show the exact underlying command before execution or make it trivially inspectable.

Example Arista commands:

- show version
- show interfaces status
- show lldp neighbors
- show mac address-table
- show arp
- show ip bgp summary
- show mlag
- show vxlan config-sanity
- show environment all
- show interfaces transceiver

Commands vary across EOS versions. Do not assume every command exists.

## Linux Quick Commands

Examples:

- uname -a
- cat /etc/os-release
- uptime
- free -h
- df -h
- ip addr
- ip route
- systemctl --failed
- ps aux

Avoid commands that may expose secrets by default.

## Parsers

Parsers must be deterministic.

Never present parser output as raw truth if parsing may be incomplete.

Each structured result should include:

- source command
- raw output reference
- parsed fields
- parser/provider version
- parsing status

Possible parsing states:

- complete
- partial
- unsupported
- failed

Do not fabricate missing fields.

## Diagnostics

A diagnostic bundle is a named collection of read-only checks.

Example:

Arista Network Health

- show version
- show interfaces status
- show lldp neighbors
- show ip bgp summary
- show mlag
- show environment all

Diagnostics must:

- remain read-only
- allow cancellation
- expose raw output
- identify individual command failures
- not treat one unsupported command as total failure

## Device Comparison

Comparison is read-only.

Compare normalized structured data only when providers are compatible.

Potential categories:

- model
- OS version
- interfaces
- VLANs
- BGP peers
- MLAG
- firmware
- environment

Highlight uncertainty.

Do not hide fields that failed to parse.

## BMC Providers

Prefer standards-based APIs such as Redfish when available.

BMC actions that change power state are NOT read-only and must be classified separately.

Never mix power-control actions into passive diagnostics.

## Provider Versioning

Providers should evolve independently.

Track provider/parser versions if results may be persisted or compared over time.

Avoid coupling database schema tightly to one vendor's output format.

## Testing

Each provider should include fixtures for:

- normal output
- empty output
- unsupported command
- malformed output
- version variations
- partial output

Detection tests should include false-positive cases.

## Definition of Done

A provider is complete when:

- detection is conservative
- manual override exists
- commands are transparent
- read-only and modifying actions are separated
- parser uncertainty is represented
- raw output remains available
- tests include multiple output variants