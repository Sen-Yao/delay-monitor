import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import type { AppSettings, Incident, LatencySample, SessionSummary, TargetConfig, TracerouteResult } from "../src/shared/types.js";
import { DATA_DIR, DEFAULT_SETTINGS, DEFAULT_TARGETS } from "./defaults.js";

export class JsonStorage {
  private root: string;

  constructor(root = path.resolve(DATA_DIR)) {
    this.root = root;
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await this.ensureJson("targets.json", DEFAULT_TARGETS);
    await this.ensureJson("settings.json", DEFAULT_SETTINGS);
    await this.ensureJson("sessions.json", []);
    await this.ensureJson("incidents.json", []);
    await this.ensureJson("traceroutes.json", []);
  }

  async readTargets(): Promise<TargetConfig[]> {
    return this.readJson<TargetConfig[]>("targets.json", DEFAULT_TARGETS);
  }

  async writeTargets(targets: TargetConfig[]): Promise<void> {
    await this.writeJson("targets.json", targets);
  }

  async readSettings(): Promise<AppSettings> {
    return this.readJson<AppSettings>("settings.json", DEFAULT_SETTINGS);
  }

  async writeSettings(settings: AppSettings): Promise<void> {
    await this.writeJson("settings.json", settings);
  }

  async readSessions(): Promise<SessionSummary[]> {
    return this.readJson<SessionSummary[]>("sessions.json", []);
  }

  async writeSessions(sessions: SessionSummary[]): Promise<void> {
    await this.writeJson("sessions.json", sessions);
  }

  async readIncidents(): Promise<Incident[]> {
    return this.readJson<Incident[]>("incidents.json", []);
  }

  async writeIncidents(incidents: Incident[]): Promise<void> {
    await this.writeJson("incidents.json", incidents);
  }

  async readTraceroutes(): Promise<TracerouteResult[]> {
    return this.readJson<TracerouteResult[]>("traceroutes.json", []);
  }

  async writeTraceroutes(results: TracerouteResult[]): Promise<void> {
    await this.writeJson("traceroutes.json", results);
  }

  async appendSample(sample: LatencySample): Promise<void> {
    await appendFile(this.path("samples.jsonl"), `${JSON.stringify(sample)}\n`, "utf8");
  }

  async readSamplesSince(start: number, end = Date.now()): Promise<LatencySample[]> {
    try {
      const text = await readFile(this.path("samples.jsonl"), "utf8");
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as LatencySample)
        .filter((sample) => sample.timestamp >= start && sample.timestamp <= end);
    } catch {
      return [];
    }
  }

  private async ensureJson<T>(name: string, fallback: T): Promise<void> {
    try {
      await readFile(this.path(name), "utf8");
    } catch {
      await this.writeJson(name, fallback);
    }
  }

  private async readJson<T>(name: string, fallback: T): Promise<T> {
    try {
      const text = await readFile(this.path(name), "utf8");
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(name: string, value: unknown): Promise<void> {
    await writeFile(this.path(name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  private path(name: string): string {
    return path.join(this.root, name);
  }
}
