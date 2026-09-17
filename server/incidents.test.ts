import { describe, expect, it } from "vitest";
import type { LatencySample, NetworkStatus } from "../src/shared/types.js";
import { IncidentDetector } from "./incidents.js";

const networkStatus: NetworkStatus = {
  checkedAt: 1,
  defaultGateway: "192.168.1.1",
  activeInterface: "en0",
  tunInterfaces: [],
  hasProxyLikeRoute: false,
  notes: []
};

describe("IncidentDetector", () => {
  it("opens a high latency incident after a baseline exists", () => {
    const detector = new IncidentDetector();
    const events = [];
    for (let index = 0; index < 10; index += 1) {
      events.push(...detector.observe(sample(index, 10), "session_1", networkStatus));
    }
    events.push(...detector.observe(sample(11, 150), "session_1", networkStatus));

    expect(events.some((event) => event.type === "high_latency")).toBe(true);
  });

  it("opens a timeout incident", () => {
    const detector = new IncidentDetector();
    const events = detector.observe({ ...sample(1, null), status: "timeout", packetLoss: 1 }, "session_1", networkStatus);

    expect(events[0].type).toBe("timeout");
    expect(events[0].severity).toBe("critical");
  });
});

function sample(index: number, rttMs: number | null): LatencySample {
  return {
    id: `sample_${index}`,
    targetId: "router-a",
    timestamp: index * 1000,
    status: rttMs === null ? "timeout" : "ok",
    rttMs,
    packetLoss: rttMs === null ? 1 : 0
  };
}
