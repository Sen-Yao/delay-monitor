import type {
  AppSettings,
  Incident,
  LatencySample,
  LolServerAddress,
  NetworkStatus,
  SessionSummary,
  StreamEvent,
  TargetConfig
} from "../src/shared/types.js";
import { probeTarget } from "./probes.js";
import { JsonStorage } from "./storage.js";
import { IncidentDetector, summarizeSamples } from "./incidents.js";
import { getNetworkStatus } from "./network.js";
import { id } from "./utils.js";
import { DEFAULT_SETTINGS, DEFAULT_TARGETS } from "./defaults.js";

type Listener = (event: StreamEvent) => void;

export class Sampler {
  private storage: JsonStorage;
  private detector = new IncidentDetector();
  private targets: TargetConfig[] = [];
  private settings: AppSettings = DEFAULT_SETTINGS;
  private timers = new Map<string, NodeJS.Timeout>();
  private listeners = new Set<Listener>();
  private latest = new Map<string, LatencySample>();
  private incidents: Incident[] = [];
  private session: SessionSummary | null = null;
  private networkStatus: NetworkStatus = {
    checkedAt: Date.now(),
    defaultGateway: null,
    activeInterface: null,
    tunInterfaces: [],
    hasProxyLikeRoute: false,
    notes: []
  };
  private networkTimer: NodeJS.Timeout | null = null;

  constructor(storage: JsonStorage) {
    this.storage = storage;
  }

  async init(): Promise<void> {
    const storedTargets = await this.storage.readTargets();
    const storedSettings = await this.storage.readSettings();
    this.settings = normalizeSettings(mergeLegacyLolTargets(storedSettings, storedTargets));
    this.targets = applyLolSelection(migrateTargets(storedTargets), this.settings);
    await this.storage.writeSettings(this.settings);
    await this.storage.writeTargets(this.targets);
    this.incidents = (await this.storage.readIncidents()).slice(-200);
    this.networkStatus = await getNetworkStatus();
    this.startTimers();
    this.networkTimer = setInterval(() => void this.refreshNetworkStatus(), 15000);
  }

  getTargets(): TargetConfig[] {
    return this.targets;
  }

  async setTargets(targets: TargetConfig[]): Promise<TargetConfig[]> {
    this.targets = applyLolSelection(normalizeTargets(migrateTargets(targets)), this.settings);
    await this.storage.writeTargets(this.targets);
    this.restartTimers();
    this.emitSnapshot();
    return this.targets;
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  async setSettings(settings: AppSettings): Promise<AppSettings> {
    this.settings = normalizeSettings(settings);
    this.targets = applyLolSelection(this.targets, this.settings);
    await this.storage.writeSettings(this.settings);
    await this.storage.writeTargets(this.targets);
    this.restartTimers();
    this.emitSnapshot();
    return this.settings;
  }

  getLatest(): Record<string, LatencySample> {
    return Object.fromEntries(this.latest);
  }

  getIncidents(): Incident[] {
    return this.incidents.slice(-100).reverse();
  }

  getSession(): SessionSummary | null {
    return this.session;
  }

  getNetworkStatus(): NetworkStatus {
    return this.networkStatus;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({
      type: "snapshot",
      targets: this.targets,
      settings: this.settings,
      latest: this.getLatest(),
      incidents: this.getIncidents(),
      session: this.session,
      networkStatus: this.networkStatus
    });
    return () => this.listeners.delete(listener);
  }

  async startSession(): Promise<SessionSummary> {
    if (this.session && this.session.end === null) return this.session;
    this.session = {
      id: id("session"),
      start: Date.now(),
      end: null,
      targets: this.targets.filter((target) => target.enabled).map((target) => target.id),
      incidents: 0,
      avg: null,
      max: null,
      p95: null,
      jitter: null,
      loss: 0
    };
    const sessions = await this.storage.readSessions();
    await this.storage.writeSessions([this.session, ...sessions]);
    this.emitSnapshot();
    return this.session;
  }

  async stopSession(): Promise<SessionSummary | null> {
    if (!this.session) return null;
    const closedIncidents = this.detector.closeAll();
    if (closedIncidents.length) await this.persistIncidents(closedIncidents);
    const samples = await this.storage.readSamplesSince(this.session.start, Date.now());
    const summary = summarizeSamples(samples);
    this.session = {
      ...this.session,
      end: Date.now(),
      incidents: this.incidents.filter((incident) => incident.sessionId === this.session?.id).length,
      avg: summary.avg,
      max: summary.max,
      p95: summary.p95,
      jitter: summary.jitter,
      loss: summary.loss
    };
    const sessions = await this.storage.readSessions();
    const next = [this.session, ...sessions.filter((item) => item.id !== this.session?.id)];
    await this.storage.writeSessions(next);
    const finished = this.session;
    this.session = null;
    this.emitSnapshot();
    return finished;
  }

  close(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.networkTimer) clearInterval(this.networkTimer);
  }

  private startTimers(): void {
    for (const target of this.targets) this.schedule(target, 50);
  }

  private restartTimers(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.startTimers();
  }

  private schedule(target: TargetConfig, delay = target.intervalMs): void {
    const timer = setTimeout(async () => {
      await this.sample(target.id);
      const updated = this.targets.find((item) => item.id === target.id);
      if (updated) this.schedule(updated);
    }, Math.max(250, delay));
    this.timers.set(target.id, timer);
  }

  private async sample(targetId: string): Promise<void> {
    const target = this.targets.find((item) => item.id === targetId);
    if (!target) return;
    const sample = await probeTarget(target);
    this.latest.set(targetId, sample);
    await this.storage.appendSample(sample);
    this.emit({ type: "sample", sample });

    const incidents = this.detector.observe(sample, this.session?.id ?? null, this.networkStatus);
    if (incidents.length > 0) await this.persistIncidents(incidents);
  }

  private async persistIncidents(incidents: Incident[]): Promise<void> {
    const byId = new Map(this.incidents.map((incident) => [incident.id, incident]));
    for (const incident of incidents) {
      byId.set(incident.id, incident);
      this.emit({ type: "incident", incident });
    }
    this.incidents = [...byId.values()].slice(-300);
    await this.storage.writeIncidents(this.incidents);
  }

  private async refreshNetworkStatus(): Promise<void> {
    this.networkStatus = await getNetworkStatus();
    this.emit({ type: "network", networkStatus: this.networkStatus });
  }

  private emitSnapshot(): void {
    this.emit({
      type: "snapshot",
      targets: this.targets,
      settings: this.settings,
      latest: this.getLatest(),
      incidents: this.getIncidents(),
      session: this.session,
      networkStatus: this.networkStatus
    });
  }

  private emit(event: StreamEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export function normalizeTargets(targets: TargetConfig[]): TargetConfig[] {
  const seen = new Set<string>();
  return targets.map((target) => {
    const idValue = target.id.trim() || id("target");
    if (seen.has(idValue)) throw new Error(`目标 ID 重复: ${idValue}`);
    seen.add(idValue);
    const port = Number(target.port);
    if (target.method === "tcp" && (!Number.isFinite(port) || port < 1 || port > 65535)) {
      throw new Error(`${target.name} 的 TCP 端口无效`);
    }
    return {
      ...target,
      id: idValue,
      name: target.name.trim() || idValue,
      host: target.host.trim(),
      intervalMs: Math.max(500, Math.min(Number(target.intervalMs) || 1000, 60000)),
      port: target.method === "tcp" ? port : undefined,
      enabled: Boolean(target.enabled && target.host.trim())
    };
  });
}

export function normalizeSettings(settings: AppSettings): AppSettings {
  const seen = new Set<string>();
  const lolServers = settings.lolServers.map((server) => {
    const idValue = server.id.trim() || id("lol");
    if (seen.has(idValue)) throw new Error(`LOL 地址 ID 重复: ${idValue}`);
    seen.add(idValue);
    const port = Number(server.port);
    if (server.method === "tcp" && (!Number.isFinite(port) || port < 1 || port > 65535)) {
      throw new Error(`${server.name} 的 TCP 端口无效`);
    }
    return {
      ...server,
      id: idValue,
      name: server.name.trim() || idValue,
      host: server.host.trim(),
      method: server.method,
      port: server.method === "tcp" ? port : undefined,
      note: server.note?.trim()
    };
  });

  const selectedExists = lolServers.some((server) => server.id === settings.selectedLolServerId);
  return {
    selectedLolServerId: selectedExists ? settings.selectedLolServerId : lolServers[0]?.id ?? "",
    lolServers
  };
}

function migrateTargets(targets: TargetConfig[]): TargetConfig[] {
  const nonLol = targets.filter((target) => target.group !== "lol");
  const current = targets.find((target) => target.id === "lol-current");
  return normalizeTargets([
    ...nonLol,
    current ?? DEFAULT_TARGETS.find((target) => target.id === "lol-current")!
  ]);
}

function mergeLegacyLolTargets(settings: AppSettings, targets: TargetConfig[]): AppSettings {
  const existingNames = new Set(settings.lolServers.map((server) => server.name));
  const legacyServers: LolServerAddress[] = targets
    .filter((target) => target.group === "lol" && target.id !== "lol-current")
    .filter((target) => !existingNames.has(target.name))
    .map((target) => ({
      id: target.id.replace(/^lol-/, "") || id("lol"),
      name: target.name,
      host: target.host,
      method: target.method,
      port: target.port,
      note: "由旧版 LOL 目标迁移"
    }));

  return {
    selectedLolServerId: settings.selectedLolServerId,
    lolServers: [...settings.lolServers, ...legacyServers]
  };
}

function applyLolSelection(targets: TargetConfig[], settings: AppSettings): TargetConfig[] {
  const selected = settings.lolServers.find((server) => server.id === settings.selectedLolServerId);
  return targets.map((target) => {
    if (target.id !== "lol-current") return target;
    return {
      ...target,
      name: selected?.name ? `LOL · ${selected.name}` : "当前 LOL",
      host: selected?.host ?? "",
      method: selected?.method ?? "icmp",
      port: selected?.method === "tcp" ? selected.port : undefined,
      enabled: Boolean(selected?.host)
    };
  });
}
