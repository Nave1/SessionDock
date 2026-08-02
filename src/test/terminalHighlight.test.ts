import { describe, expect, it } from "vitest";
import { highlightTerminalOutput } from "../utils/terminalHighlight";

const stripSemanticColors = (text: string) => text.replace(/\x1b\[38;2;\d+;\d+;\d+m|\x1b\[39m/g, "");

describe("Terminal output highlighting", () => {
  it("colors network tokens without changing visible text", () => {
    const input = "Gi1/0/1  192.168.10.1  up  VLAN 20\r\n";
    const output = highlightTerminalOutput(input, true);

    expect(output).toContain("\x1b[38;2;");
    expect(stripSemanticColors(output)).toBe(input);
  });

  it("returns output unchanged when disabled", () => {
    const input = "10.0.0.1 connected";
    expect(highlightTerminalOutput(input, false)).toBe(input);
  });

  it("preserves device-provided ANSI exactly", () => {
    const input = "\x1b[31m10.0.0.1 down\x1b[0m\r\n";
    expect(highlightTerminalOutput(input, true)).toBe(input);
  });

  it("resumes coloring plain output after a native ANSI chunk", () => {
    const nativeChunk = "\x1b[2J\x1b[H";
    const plainChunk = "Gi1/0/1  Server-Port  connected  20  full  1000\r\n";

    expect(highlightTerminalOutput(nativeChunk, true)).toBe(nativeChunk);
    const output = highlightTerminalOutput(plainChunk, true);
    expect(output).toContain("\x1b[38;2;");
    expect(stripSemanticColors(output)).toBe(plainChunk);
  });

  it("colors common show interfaces status output", () => {
    const input = [
      "Gi1/0/1  uplink       connected    trunk  a-full a-1000 10/100/1000BaseTX",
      "Eth1/12   spare        notconnect   30     auto   auto   10/100/1000BaseTX",
    ].join("\r\n");
    const output = highlightTerminalOutput(input, true);

    expect(output).toContain("\x1b[38;2;96;165;250mGi1/0/1");
    expect(output).toContain("\x1b[38;2;74;222;128mconnected");
    expect(output).toContain("\x1b[38;2;248;113;113mnotconnect");
    expect(stripSemanticColors(output)).toBe(input);
  });

  it("colors Cisco ping results and preserves their text", () => {
    const input = "Sending 5, 100-byte ICMP Echos to 192.168.1.1, timeout is 2 seconds:\r\n!!!!!\r\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 1/2/4 ms\r\n";
    const output = highlightTerminalOutput(input, true);

    expect(output).toContain("\x1b[38;2;45;212;191m192.168.1.1");
    expect(output).toContain("\x1b[38;2;74;222;128m!!!!!");
    expect(output).toContain("\x1b[38;2;74;222;128mSuccess rate is 100 percent (5/5)");
    expect(stripSemanticColors(output)).toBe(input);
  });

  it("preserves cursor and terminal control output exactly", () => {
    const samples = ["progress 10%\b\b20%", "\x1b[2Jclear", "prompt\x07"];
    for (const input of samples) {
      expect(highlightTerminalOutput(input, true)).toBe(input);
    }
  });

  it("does not color invalid IPv4 addresses", () => {
    const input = "peer 999.168.1.1";
    expect(highlightTerminalOutput(input, true)).toBe(input);
  });
});