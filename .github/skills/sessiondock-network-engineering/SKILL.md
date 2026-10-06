---
name: sessiondock-network-engineering
description: Network engineering domain guidance for SessionDock infrastructure workflows and device intelligence.
---

# SessionDock Network Engineering Skill

## Purpose

Use this skill when designing features for:

- switches
- routers
- spine-leaf networks
- data center fabrics
- BGP
- EVPN
- VXLAN
- MLAG
- LACP
- LLDP
- VLANs
- ARP
- MAC address tables
- interfaces
- transceivers
- BMC-connected infrastructure

This is not a networking course. It defines product-oriented network engineering context.

## Primary User Workflows

Network engineers frequently need to answer:

- Is the interface physically up?
- What speed is negotiated?
- Is traffic moving?
- Is the switch learning MAC addresses?
- Is ARP resolving?
- Who is connected on this port?
- Is LLDP identifying the neighbor?
- Is the port in the expected VLAN?
- Is the port-channel healthy?
- Is LACP synchronized?
- Is MLAG healthy?
- Are BGP peers established?
- Is EVPN healthy?
- Is VXLAN/VTEP state correct?
- Are transceivers healthy?
- Are there interface errors or flaps?
- Is the device running the expected software version?

SessionDock should optimize around these questions.

## Data Center Topology Concepts

Common environment:

Server
-> Leaf
-> Spine
-> Leaf
-> Server

Important concepts:

### Underlay

IP routed fabric connecting network devices.

### Overlay

Logical network carried over the underlay, commonly VXLAN.

### BGP

Used for route exchange in many data center fabrics.

### EVPN

BGP address family commonly used to distribute MAC/IP reachability for VXLAN fabrics.

### ECMP

Multiple equal-cost paths used simultaneously.

### MLAG

Allows a downstream device to connect to two switches while presenting a logical multi-chassis link.

### LACP

Negotiates link aggregation membership.

### LLDP

Discovers directly connected neighbors.

## Network Device Metadata

Useful fields:

- hostname
- management IP
- vendor
- model
- serial
- OS
- OS version
- role
- site
- room
- row
- rack
- cluster
- environment
- tags

Do not force all fields to be mandatory.

## Read-Only First

Device Intelligence should prefer read-only commands.

Never enter configuration mode for passive diagnostics.

Never issue commands such as:

- configure
- reload
- shutdown
- write erase
- erase startup-config

as part of automatic detection or health checks.

## Arista EOS Initial Focus

Recommended initial read-only areas:

### Identity

- show version
- show hostname

### Interfaces

- show interfaces status
- show interfaces counters errors
- show interfaces counters rates
- show interfaces transceiver

### Discovery

- show lldp neighbors
- show lldp neighbors detail

### Layer 2

- show vlan
- show mac address-table
- show port-channel
- show lacp neighbor

### Layer 3

- show arp
- show ip route

### Fabric

- show ip bgp summary
- show bgp evpn summary where applicable
- show vxlan vtep
- show mlag

### Health

- show environment all
- show logging last 50 where appropriate

Command availability varies by EOS version.

Provider logic must tolerate unsupported commands.

## Troubleshooting Model

A useful infrastructure workflow should progress from lower layers upward:

1. Physical link
2. Interface state
3. Speed/transceiver
4. Errors/counters
5. VLAN/LAG
6. MAC learning
7. ARP/neighbor resolution
8. Routing/BGP
9. Overlay/EVPN/VXLAN
10. Application/system reachability

SessionDock diagnostics should reflect this layered model.

## Device Comparison

Useful network comparisons:

- EOS/IOS/NX-OS versions
- interface status
- transceiver state
- port-channel membership
- VLAN presence
- BGP peer state
- MLAG state
- VTEP/VXLAN state

Comparison should not imply that different values are necessarily wrong.

## MultiExec

Safe common use:

- show version
- show interfaces status
- show lldp neighbors
- show ip bgp summary

Potentially dangerous use:

- configuration changes
- interface shutdown
- reload
- write operations

MultiExec safeguards are mandatory.

## BMC + Network Correlation

Future SessionDock workflows may correlate:

Server session
<-> BMC
<-> switch port

Possible metadata relationships:

- server management IP
- BMC IP
- switch hostname
- switch interface
- MAC address
- rack position

Do not automatically assert topology unless evidence exists.

## Product Principle

Do not overload the user with protocol theory.

Present:

- state
- evidence
- command source
- likely interpretation
- next useful read-only check

The raw device output must always remain available.