export type TargetGroup = "local" | "lol" | "public";
export type ProbeMethod = "icmp" | "tcp";
export type SampleStatus = "ok" | "timeout" | "error" | "disabled" | "unconfigured";
export type IncidentType = "high_latency" | "jitter" | "timeout" | "packet_loss";
export type Severity = "info" | "warn" | "critical";

export interface TargetConfig {
  id: string;
  name: string;
  group: TargetGroup;
  host: string;
  method: ProbeMethod;
  port?: number;
  intervalMs: number;
  enabled: boolean;
}

export interface LolServerAddress {
  id: string;
  name: string;
  host: string;
  method: ProbeMethod;
  port?: number;
  note?: string;
}

export interface AppSettings {
  lolServers: LolServerAddress[];
  selectedLolServerId: string;
}

export interface LatencySample {
  id: string;
  targetId: string;
  timestamp: number;
  status: SampleStatus;
  rttMs: number | null;
  packetLoss: number;
  error?: string;
}

export interface NetworkStatus {
  checkedAt: number;
  defaultGateway: string | null;
  activeInterface: string | null;
  tunInterfaces: string[];
  hasProxyLikeRoute: boolean;
  notes: string[];
}

export interface IncidentSummary {
  avg: number | null;
  max: number | null;
  p95: number | null;
  jitter: number | null;
  loss: number;
}

export interface Incident {
  id: string;
  sessionId: string | null;
  targetId: string;
  start: number;
  end: number | null;
  type: IncidentType;
  severity: Severity;
  summary: IncidentSummary;
  samplesBefore: LatencySample[];
  samplesAfter: LatencySample[];
  networkStatus: NetworkStatus;
}

export interface SessionSummary {
  id: string;
  start: number;
  end: number | null;
  targets: string[];
  incidents: number;
  avg: number | null;
  max: number | null;
  p95: number | null;
  jitter: number | null;
  loss: number;
}

export interface TracerouteHop {
  hop: number;
  host: string | null;
  address: string | null;
  rtts: number[];
  raw: string;
}

export interface TracerouteResult {
  id: string;
  targetId: string;
  host: string;
  timestamp: number;
  status: "ok" | "partial" | "failed";
  hops: TracerouteHop[];
  raw: string;
  error?: string;
}

export interface StreamSnapshot {
  type: "snapshot";
  targets: TargetConfig[];
  settings: AppSettings;
  latest: Record<string, LatencySample>;
  incidents: Incident[];
  session: SessionSummary | null;
  networkStatus: NetworkStatus;
}

export interface StreamSampleEvent {
  type: "sample";
  sample: LatencySample;
}

export interface StreamIncidentEvent {
  type: "incident";
  incident: Incident;
}

export interface StreamNetworkEvent {
  type: "network";
  networkStatus: NetworkStatus;
}

export type StreamEvent = StreamSnapshot | StreamSampleEvent | StreamIncidentEvent | StreamNetworkEvent;
