import { describe, expect, it } from "vitest";
import { parsePingOutput, parseTraceroute } from "./probes.js";

describe("parsePingOutput", () => {
  it("parses successful macOS ping output", () => {
    const parsed = parsePingOutput(`
PING 192.168.1.1 (192.168.1.1): 56 data bytes
64 bytes from 192.168.1.1: icmp_seq=0 ttl=64 time=3.909 ms

--- 192.168.1.1 ping statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 3.909/3.909/3.909/0.000 ms
`);

    expect(parsed.status).toBe("ok");
    expect(parsed.rttMs).toBe(3.909);
    expect(parsed.packetLoss).toBe(0);
  });

  it("parses request timeout", () => {
    const parsed = parsePingOutput(`
PING 10.0.0.1 (10.0.0.1): 56 data bytes
Request timeout for icmp_seq 0

--- 10.0.0.1 ping statistics ---
1 packets transmitted, 0 packets received, 100.0% packet loss
`);

    expect(parsed.status).toBe("timeout");
    expect(parsed.rttMs).toBeNull();
    expect(parsed.packetLoss).toBe(1);
  });
});

describe("parseTraceroute", () => {
  it("parses hops and hidden hops", () => {
    const hops = parseTraceroute(`
traceroute to 223.5.5.5 (223.5.5.5), 8 hops max, 40 byte packets
 1  192.168.1.1 (192.168.1.1)  2.111 ms  2.022 ms  1.901 ms
 2  * * *
`);

    expect(hops).toHaveLength(2);
    expect(hops[0].address).toBe("192.168.1.1");
    expect(hops[0].rtts[0]).toBe(2.111);
    expect(hops[1].host).toBeNull();
  });
});
