import type { Incident, IncidentSummary, IncidentType, LatencySample, NetworkStatus } from "../src/shared/types.js";
import { avg, id, percentile, round, stddev } from "./utils.js";

interface TargetState {
  recent: LatencySample[];
  active: Map<IncidentType, Incident>;
  baseline: number | null;
}

export class IncidentDetector {
  private states = new Map<string, TargetState>();

  observe(sample: LatencySample, sessionId: string | null, networkStatus: NetworkStatus): Incident[] {
    const state = this.getState(sample.targetId);
    state.recent.push(sample);
    state.recent = state.recent.slice(-60);

    const emitted: Incident[] = [];
    const okRtts = state.recent
      .filter((item) => item.status === "ok" && item.rttMs !== null)
      .map((item) => item.rttMs as number);

    if (okRtts.length >= 8) {
      const p50 = percentile(okRtts, 50);
      state.baseline = p50 === null ? state.baseline : p50;
    }

    const types = this.detectTypes(state, sample);
    const allTypes: IncidentType[] = ["high_latency", "jitter", "timeout", "packet_loss"];

    for (const type of allTypes) {
      const active = state.active.get(type);
      if (types.includes(type)) {
        if (!active) {
          const incident = this.openIncident(type, sample, state, sessionId, networkStatus);
          state.active.set(type, incident);
          emitted.push(incident);
        } else {
          active.end = null;
          active.samplesAfter = state.recent.slice(-10);
          active.summary = summarizeSamples(active.samplesAfter);
        }
      } else if (active) {
        active.end = sample.timestamp;
        active.samplesAfter = state.recent.slice(-10);
        active.summary = summarizeSamples([...active.samplesBefore, ...active.samplesAfter]);
        state.active.delete(type);
        emitted.push(active);
      }
    }

    return emitted;
  }

  closeAll(endTime = Date.now()): Incident[] {
    const closed: Incident[] = [];
    for (const state of this.states.values()) {
      for (const incident of state.active.values()) {
        incident.end = endTime;
        incident.samplesAfter = state.recent.slice(-10);
        incident.summary = summarizeSamples([...incident.samplesBefore, ...incident.samplesAfter]);
        closed.push(incident);
      }
      state.active.clear();
    }
    return closed;
  }

  private detectTypes(state: TargetState, sample: LatencySample): IncidentType[] {
    const detected: IncidentType[] = [];
    const recent10 = state.recent.slice(-10);
    const recentRtts = recent10.filter((item) => item.rttMs !== null).map((item) => item.rttMs as number);
    const recentLoss = recent10.filter((item) => item.status === "timeout" || item.packetLoss >= 1).length;

    if (sample.status === "timeout" || sample.status === "error") detected.push("timeout");
    if (sample.packetLoss > 0 || recentLoss >= 2) detected.push("packet_loss");

    const baseline = state.baseline ?? percentile(recentRtts, 50) ?? null;
    if (sample.rttMs !== null && baseline !== null) {
      const highByBaseline = sample.rttMs > Math.max(80, baseline * 2.5);
      const highAbsolute = sample.rttMs > 160;
      if (highByBaseline || highAbsolute) detected.push("high_latency");
    }

    const jitter = stddev(recentRtts);
    if (recentRtts.length >= 6 && jitter !== null && jitter > Math.max(20, (baseline ?? 20) * 0.8)) {
      detected.push("jitter");
    }

    return detected;
  }

  private openIncident(
    type: IncidentType,
    sample: LatencySample,
    state: TargetState,
    sessionId: string | null,
    networkStatus: NetworkStatus
  ): Incident {
    const samplesBefore = state.recent.slice(-12);
    return {
      id: id("incident"),
      sessionId,
      targetId: sample.targetId,
      start: sample.timestamp,
      end: null,
      type,
      severity: type === "timeout" || type === "packet_loss" ? "critical" : "warn",
      summary: summarizeSamples(samplesBefore),
      samplesBefore,
      samplesAfter: [],
      networkStatus
    };
  }

  private getState(targetId: string): TargetState {
    let state = this.states.get(targetId);
    if (!state) {
      state = {
        recent: [],
        active: new Map(),
        baseline: null
      };
      this.states.set(targetId, state);
    }
    return state;
  }
}

export function summarizeSamples(samples: LatencySample[]): IncidentSummary {
  const rtts = samples.filter((sample) => sample.rttMs !== null).map((sample) => sample.rttMs as number);
  return {
    avg: round(avg(rtts)),
    max: round(rtts.length ? Math.max(...rtts) : null),
    p95: round(percentile(rtts, 95)),
    jitter: round(stddev(rtts)),
    loss: samples.length === 0 ? 0 : round(samples.filter((sample) => sample.status !== "ok").length / samples.length, 3) ?? 0
  };
}
