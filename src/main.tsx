import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Cable,
  Clock3,
  Crosshair,
  History,
  Laptop,
  Play,
  Radar,
  Router,
  Route,
  Save,
  Server,
  Square,
  Wifi
} from "lucide-react";
import type {
  AppSettings,
  Incident,
  LatencySample,
  LolServerAddress,
  NetworkStatus,
  SessionSummary,
  StreamEvent,
  TargetConfig,
  TracerouteResult
} from "./shared/types";
import "./styles.css";

type View = "dashboard" | "targets" | "sessions";

const api = {
  async getTargets() {
    return fetchJson<TargetConfig[]>("/api/targets");
  },
  async saveSettings(settings: AppSettings) {
    return fetchJson<AppSettings>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
  },
  async saveTargets(targets: TargetConfig[]) {
    return fetchJson<TargetConfig[]>("/api/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(targets)
    });
  },
  async startSession() {
    return fetchJson<SessionSummary>("/api/session/start", { method: "POST" });
  },
  async stopSession() {
    return fetchJson<SessionSummary | null>("/api/session/stop", { method: "POST" });
  },
  async getSessions() {
    return fetchJson<SessionSummary[]>("/api/sessions");
  },
  async traceroute(targetId: string) {
    return fetchJson<TracerouteResult>("/api/diagnostics/traceroute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId })
    });
  }
};

function App() {
  const [view, setView] = useState<View>("dashboard");
  const [targets, setTargets] = useState<TargetConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ lolServers: [], selectedLolServerId: "" });
  const [latest, setLatest] = useState<Record<string, LatencySample>>({});
  const [history, setHistory] = useState<Record<string, LatencySample[]>>({});
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [trace, setTrace] = useState<TracerouteResult | null>(null);

  useEffect(() => {
    const stream = new EventSource("/api/stream");
    stream.onmessage = (message) => {
      const event = JSON.parse(message.data) as StreamEvent;
      if (event.type === "snapshot") {
        setTargets(event.targets);
        setSettings(event.settings);
        setLatest(event.latest);
        setIncidents(event.incidents);
        setSession(event.session);
        setNetworkStatus(event.networkStatus);
      }
      if (event.type === "sample") {
        setLatest((current) => ({ ...current, [event.sample.targetId]: event.sample }));
        setHistory((current) => {
          const next = [...(current[event.sample.targetId] ?? []), event.sample].slice(-90);
          return { ...current, [event.sample.targetId]: next };
        });
      }
      if (event.type === "incident") {
        setIncidents((current) => [event.incident, ...current.filter((item) => item.id !== event.incident.id)].slice(0, 100));
      }
      if (event.type === "network") setNetworkStatus(event.networkStatus);
    };
    return () => stream.close();
  }, []);

  const activeTargets = targets.filter((target) => target.enabled || target.group === "lol" || target.group === "local");
  const localTargets = targets.filter((target) => target.group === "local");
  const lolTarget = targets.find((target) => target.group === "lol");
  const health = useMemo(() => summarizeHealth(activeTargets, latest), [activeTargets, latest]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="kicker">
            <Radar size={16} /> Delay monitor
          </div>
          <h1>本地链路与峡谷延迟</h1>
        </div>
        <nav className="nav">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <Activity size={17} /> 实时
          </button>
          <button className={view === "targets" ? "active" : ""} onClick={() => setView("targets")}>
            <Crosshair size={17} /> 目标
          </button>
          <button className={view === "sessions" ? "active" : ""} onClick={() => setView("sessions")}>
            <History size={17} /> 记录
          </button>
        </nav>
      </header>

      <section className="status-strip">
        <div className={`status-tile ${health.status}`}>
          <span>整体状态</span>
          <strong>{health.label}</strong>
        </div>
        <div className="status-tile">
          <span>默认网关</span>
          <strong>{networkStatus?.defaultGateway ?? "检测中"}</strong>
        </div>
        <div className={`status-tile ${networkStatus?.hasProxyLikeRoute ? "warn" : ""}`}>
          <span>代理/TUN</span>
          <strong>{networkStatus?.hasProxyLikeRoute ? "已检测到" : "未发现"}</strong>
        </div>
        <SessionControl session={session} onStart={api.startSession} onStop={api.stopSession} />
      </section>

      {networkStatus?.notes.length ? (
        <div className="notice">
          <AlertTriangle size={18} />
          <span>{networkStatus.notes.join("；")}</span>
        </div>
      ) : null}

      {view === "dashboard" ? (
        <Dashboard
          targets={activeTargets}
          localTargets={localTargets}
          lolTarget={lolTarget}
          settings={settings}
          latest={latest}
          history={history}
          incidents={incidents}
          trace={trace}
          onTrace={async (targetId) => setTrace(await api.traceroute(targetId))}
        />
      ) : null}
      {view === "targets" ? <TargetsView targets={targets} settings={settings} onSavedTargets={setTargets} onSavedSettings={setSettings} /> : null}
      {view === "sessions" ? <SessionsView /> : null}
    </main>
  );
}

function SessionControl({
  session,
  onStart,
  onStop
}: {
  session: SessionSummary | null;
  onStart: () => Promise<SessionSummary>;
  onStop: () => Promise<SessionSummary | null>;
}) {
  const [busy, setBusy] = useState(false);
  const active = session?.end === null;
  return (
    <button
      className={`session-button ${active ? "recording" : ""}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          active ? await onStop() : await onStart();
        } finally {
          setBusy(false);
        }
      }}
    >
      {active ? <Square size={17} /> : <Play size={17} />}
      {active ? "结束记录" : "开始记录"}
    </button>
  );
}

function Dashboard({
  targets,
  localTargets,
  lolTarget,
  settings,
  latest,
  history,
  incidents,
  trace,
  onTrace
}: {
  targets: TargetConfig[];
  localTargets: TargetConfig[];
  lolTarget?: TargetConfig;
  settings: AppSettings;
  latest: Record<string, LatencySample>;
  history: Record<string, LatencySample[]>;
  incidents: Incident[];
  trace: TracerouteResult | null;
  onTrace: (targetId: string) => Promise<void>;
}) {
  return (
    <div className="dashboard">
      <TopologyMap localTargets={localTargets} lolTarget={lolTarget} latest={latest} selectedServer={settings.lolServers.find((server) => server.id === settings.selectedLolServerId)} />

      <section className="cards-grid">
        {targets.map((target) => (
          <LatencyCard key={target.id} target={target} sample={latest[target.id]} samples={history[target.id] ?? []} />
        ))}
      </section>

      <section className="main-grid">
        <Panel title="本地全链路" icon={<Cable size={18} />}>
          <LinkWaterfall targets={localTargets} latest={latest} />
        </Panel>
        <Panel title="LOL 大区目标" icon={<Wifi size={18} />}>
          <div className="target-actions">
            <button disabled={!lolTarget?.enabled} onClick={() => lolTarget && onTrace(lolTarget.id)}>
              <Route size={16} /> 当前 LOL 路径快照
            </button>
          </div>
          <TraceResult trace={trace} />
        </Panel>
      </section>

      <section className="main-grid wide-left">
        <Panel title="实时折线" icon={<Activity size={18} />}>
          <MultiChart targets={targets} history={history} />
        </Panel>
        <Panel title="异常时间轴" icon={<AlertTriangle size={18} />}>
          <IncidentList incidents={incidents} targets={targets} />
        </Panel>
      </section>
    </div>
  );
}

function TopologyMap({
  localTargets,
  lolTarget,
  latest,
  selectedServer
}: {
  localTargets: TargetConfig[];
  lolTarget?: TargetConfig;
  latest: Record<string, LatencySample>;
  selectedServer?: LolServerAddress;
}) {
  const routerA = localTargets[0];
  const routerB = localTargets[1];
  const routerARtt = latest[routerA?.id ?? ""]?.rttMs ?? null;
  const routerBRtt = latest[routerB?.id ?? ""]?.rttMs ?? null;
  const lolRtt = latest[lolTarget?.id ?? ""]?.rttMs ?? null;
  const routerBDelta = segmentDelta(routerBRtt, routerARtt);
  const lolDelta = segmentDelta(lolRtt, routerBRtt);
  const nodes = [
    { id: "local", label: "本地", detail: "MacBook", icon: <Laptop size={24} /> },
    { id: routerA?.id ?? "router-a", label: routerA?.name ?? "路由器 A", detail: routerA?.host ?? "192.168.1.1", icon: <Router size={24} /> },
    { id: routerB?.id ?? "router-b", label: routerB?.name ?? "路由器 B", detail: routerB?.host ?? "192.168.0.1", icon: <Router size={24} /> },
    { id: "upstream", label: "未知上游", detail: "路径快照", icon: <Route size={24} /> },
    { id: lolTarget?.id ?? "lol-current", label: selectedServer?.name ?? "当前 LOL", detail: lolTarget?.host || "未配置", icon: <Server size={24} /> }
  ];
  const segments = [
    { id: "seg-a", value: routerARtt, label: "本机 - A", estimated: false },
    { id: "seg-b", value: routerBDelta, label: "A - B", estimated: true },
    { id: "seg-up", value: null, label: "B - 上游", estimated: true },
    { id: "seg-lol", value: lolDelta, label: "到 LOL", estimated: true }
  ];

  return (
    <section className="topology-panel" aria-label="网络拓扑">
      <div className="topology-track">
        {nodes.map((node, index) => (
          <React.Fragment key={node.id}>
            <div className="topology-node">
              <div className="node-icon">{node.icon}</div>
              <strong>{node.label}</strong>
              <span>{node.detail}</span>
            </div>
            {segments[index] ? (
              <TopologySegment value={segments[index].value} label={segments[index].label} estimated={segments[index].estimated} />
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function TopologySegment({ value, label, estimated }: { value: number | null; label: string; estimated: boolean }) {
  const level = latencyLevel(value);
  return (
    <div className="topology-segment">
      <span>{value === null ? label : `${estimated ? "≈" : ""}${value.toFixed(1)} ms`}</span>
      <div className={`segment-line ${level}`} />
    </div>
  );
}

function LatencyCard({ target, sample, samples }: { target: TargetConfig; sample?: LatencySample; samples: LatencySample[] }) {
  const status = sampleStatus(sample, target);
  return (
    <article className={`latency-card ${status.kind}`}>
      <div className="card-head">
        <span>{target.group === "lol" ? "LOL" : target.group === "local" ? "LOCAL" : "PUBLIC"}</span>
        <strong>{target.name}</strong>
      </div>
      <div className="metric">
        {sample?.rttMs !== null && sample?.rttMs !== undefined ? (
          <>
            {sample.rttMs.toFixed(1)}
            <small>ms</small>
          </>
        ) : (
          <span className="empty-metric">--</span>
        )}
      </div>
      <MiniSparkline samples={samples} />
      <div className="card-foot">
        <span>{target.host || "未配置"}</span>
        <b>{status.label}</b>
      </div>
    </article>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header>
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function LinkWaterfall({ targets, latest }: { targets: TargetConfig[]; latest: Record<string, LatencySample> }) {
  return (
    <div className="waterfall">
      {targets.map((target, index) => {
        const sample = latest[target.id];
        return (
          <div className="hop" key={target.id}>
            <div className="hop-index">{index + 1}</div>
            <div>
              <strong>{target.name}</strong>
              <span>{target.host}</span>
            </div>
            <b>{sample?.rttMs != null ? `${sample.rttMs.toFixed(1)} ms` : "--"}</b>
          </div>
        );
      })}
      <div className="hop ghost">
        <div className="hop-index">?</div>
        <div>
          <strong>未知上游</strong>
          <span>通过路径快照辅助判断</span>
        </div>
        <b>低频诊断</b>
      </div>
    </div>
  );
}

function MultiChart({ targets, history }: { targets: TargetConfig[]; history: Record<string, LatencySample[]> }) {
  const width = 720;
  const height = 260;
  const allSamples = targets.flatMap((target) => history[target.id] ?? []);
  const max = Math.max(20, ...allSamples.map((sample) => sample.rttMs ?? 0));

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="实时延迟折线图">
      {[0, 1, 2, 3].map((line) => (
        <line key={line} x1="0" x2={width} y1={(height / 4) * line} y2={(height / 4) * line} />
      ))}
      {targets.map((target, index) => {
        const samples = history[target.id] ?? [];
        const points = samples
          .map((sample, sampleIndex) => {
            const x = samples.length <= 1 ? 0 : (sampleIndex / (samples.length - 1)) * width;
            const y = height - ((sample.rttMs ?? 0) / max) * (height - 16) - 8;
            return `${x},${y}`;
          })
          .join(" ");
        return <polyline key={target.id} points={points} className={`series s${index % 6}`} />;
      })}
    </svg>
  );
}

function MiniSparkline({ samples }: { samples: LatencySample[] }) {
  const points = samples.slice(-28);
  const max = Math.max(10, ...points.map((sample) => sample.rttMs ?? 0));
  const coords = points
    .map((sample, index) => {
      const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 120;
      const y = 36 - ((sample.rttMs ?? 0) / max) * 30;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="spark" viewBox="0 0 120 40" aria-hidden="true">
      <polyline points={coords} />
    </svg>
  );
}

function IncidentList({ incidents, targets }: { incidents: Incident[]; targets: TargetConfig[] }) {
  if (!incidents.length) return <div className="empty">暂无异常。开始记录后，这里会保留抖动、丢包和超时片段。</div>;
  return (
    <div className="incident-list">
      {incidents.slice(0, 10).map((incident) => {
        const target = targets.find((item) => item.id === incident.targetId);
        return (
          <div className={`incident ${incident.severity}`} key={incident.id}>
            <div>
              <strong>{target?.name ?? incident.targetId}</strong>
              <span>{incidentLabel(incident.type)} · {formatTime(incident.start)}</span>
            </div>
            <b>{incident.summary.max ? `${incident.summary.max} ms` : incident.severity}</b>
          </div>
        );
      })}
    </div>
  );
}

function TraceResult({ trace }: { trace: TracerouteResult | null }) {
  if (!trace) return <div className="empty">选择一个 LOL 目标后可手动触发路径快照。</div>;
  return (
    <div className="trace">
      <div className={`trace-status ${trace.status}`}>{trace.status === "ok" ? "已获得路径" : "路径不完整"}</div>
      {trace.hops.length ? (
        trace.hops.slice(0, 12).map((hop) => (
          <div className="trace-hop" key={`${trace.id}-${hop.hop}`}>
            <span>{hop.hop}</span>
            <strong>{hop.address ?? "*"}</strong>
            <b>{hop.rtts.length ? `${Math.min(...hop.rtts).toFixed(1)} ms` : "*"}</b>
          </div>
        ))
      ) : (
        <div className="empty">上游可能丢弃 traceroute 包，这属于常见情况。</div>
      )}
    </div>
  );
}

function TargetsView({
  targets,
  settings,
  onSavedTargets,
  onSavedSettings
}: {
  targets: TargetConfig[];
  settings: AppSettings;
  onSavedTargets: (targets: TargetConfig[]) => void;
  onSavedSettings: (settings: AppSettings) => void;
}) {
  const [draft, setDraft] = useState<TargetConfig[]>(targets);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(settings);
  const [message, setMessage] = useState("");

  useEffect(() => setDraft(targets), [targets]);
  useEffect(() => setSettingsDraft(settings), [settings]);

  const update = (id: string, patch: Partial<TargetConfig>) => {
    setDraft((current) => current.map((target) => (target.id === id ? { ...target, ...patch } : target)));
  };

  return (
    <section className="panel full">
      <header>
        <div>
          <Crosshair size={18} />
          <h2>探测目标</h2>
        </div>
        <button
          onClick={async () => {
            setMessage("");
            const savedSettings = await api.saveSettings(settingsDraft);
            const savedTargets = await api.saveTargets(draft);
            onSavedSettings(savedSettings);
            onSavedTargets(savedTargets);
            setMessage("已保存目标配置");
          }}
        >
          <Save size={16} /> 保存
        </button>
      </header>
      <section className="lol-selector">
        <label>
          <span>当前 LOL 服务器</span>
          <select
            value={settingsDraft.selectedLolServerId}
            onChange={(event) => setSettingsDraft((current) => ({ ...current, selectedLolServerId: event.target.value }))}
          >
            {settingsDraft.lolServers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name || server.id} {server.host ? `· ${server.host}` : "· 未配置"}
              </option>
            ))}
          </select>
        </label>
      </section>
      <div className="address-book">
        <div className="address-book-head">
          <h3>LOL 地址簿</h3>
          <button
            onClick={() =>
              setSettingsDraft((current) => ({
                ...current,
                lolServers: [
                  ...current.lolServers,
                  { id: `lol-${Date.now().toString(36)}`, name: "新服务器", host: "", method: "icmp" }
                ]
              }))
            }
          >
            添加地址
          </button>
        </div>
        {settingsDraft.lolServers.map((server) => (
          <div className="address-row" key={server.id}>
            <label>
              <span>名称</span>
              <input
                value={server.name}
                onChange={(event) => updateServer(server.id, { name: event.target.value }, setSettingsDraft)}
              />
            </label>
            <label>
              <span>Host</span>
              <input
                placeholder="IP 或域名"
                value={server.host}
                onChange={(event) => updateServer(server.id, { host: event.target.value }, setSettingsDraft)}
              />
            </label>
            <label>
              <span>方法</span>
              <select value={server.method} onChange={(event) => updateServer(server.id, { method: event.target.value as TargetConfig["method"] }, setSettingsDraft)}>
                <option value="icmp">ICMP</option>
                <option value="tcp">TCP</option>
              </select>
            </label>
            <label>
              <span>端口</span>
              <input
                disabled={server.method !== "tcp"}
                type="number"
                min="1"
                max="65535"
                value={server.port ?? 443}
                onChange={(event) => updateServer(server.id, { port: Number(event.target.value) }, setSettingsDraft)}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="target-table">
        {draft.filter((target) => target.group !== "lol").map((target) => (
          <div className="target-row" key={target.id}>
            <label>
              <span>启用</span>
              <input type="checkbox" checked={target.enabled} onChange={(event) => update(target.id, { enabled: event.target.checked })} />
            </label>
            <label>
              <span>名称</span>
              <input value={target.name} onChange={(event) => update(target.id, { name: event.target.value })} />
            </label>
            <label>
              <span>Host</span>
              <input placeholder="IP 或域名" value={target.host} onChange={(event) => update(target.id, { host: event.target.value })} />
            </label>
            <label>
              <span>方法</span>
              <select value={target.method} onChange={(event) => update(target.id, { method: event.target.value as TargetConfig["method"] })}>
                <option value="icmp">ICMP</option>
                <option value="tcp">TCP</option>
              </select>
            </label>
            <label>
              <span>端口</span>
              <input
                disabled={target.method !== "tcp"}
                type="number"
                min="1"
                max="65535"
                value={target.port ?? 443}
                onChange={(event) => update(target.id, { port: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>间隔 ms</span>
              <input
                type="number"
                min="500"
                value={target.intervalMs}
                onChange={(event) => update(target.id, { intervalMs: Number(event.target.value) })}
              />
            </label>
          </div>
        ))}
      </div>
      {message ? <div className="save-message">{message}</div> : null}
    </section>
  );
}

function SessionsView() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    void api.getSessions().then(setSessions);
  }, []);

  return (
    <section className="panel full">
      <header>
        <div>
          <Clock3 size={18} />
          <h2>游戏会话</h2>
        </div>
      </header>
      <div className="sessions">
        {sessions.length ? (
          sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <div>
                <strong>{formatTime(session.start)}</strong>
                <span>{session.end ? `${Math.round((session.end - session.start) / 60000)} 分钟` : "进行中"}</span>
              </div>
              <b>avg {session.avg ?? "--"} ms</b>
              <b>p95 {session.p95 ?? "--"} ms</b>
              <b>{session.incidents} 次异常</b>
            </div>
          ))
        ) : (
          <div className="empty">还没有完成的游戏会话。</div>
        )}
      </div>
    </section>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function sampleStatus(sample: LatencySample | undefined, target: TargetConfig): { kind: string; label: string } {
  if (!target.enabled) return { kind: "idle", label: "未启用" };
  if (!target.host) return { kind: "idle", label: "未配置" };
  if (!sample) return { kind: "idle", label: "等待" };
  if (sample.status !== "ok") return { kind: "bad", label: sample.status };
  if ((sample.rttMs ?? 0) > 120) return { kind: "warn", label: "偏高" };
  return { kind: "good", label: "稳定" };
}

function latencyLevel(value: number | null): "unknown" | "good" | "warn" | "bad" {
  if (value === null) return "unknown";
  if (value < 60) return "good";
  if (value < 120) return "warn";
  return "bad";
}

function segmentDelta(total: number | null, previous: number | null): number | null {
  if (total === null || previous === null) return null;
  const delta = total - previous;
  if (delta < -1) return null;
  return Math.max(0, delta);
}

function updateServer(id: string, patch: Partial<LolServerAddress>, setSettingsDraft: React.Dispatch<React.SetStateAction<AppSettings>>) {
  setSettingsDraft((current) => ({
    ...current,
    lolServers: current.lolServers.map((server) => (server.id === id ? { ...server, ...patch } : server))
  }));
}

function summarizeHealth(targets: TargetConfig[], latest: Record<string, LatencySample>) {
  const samples = targets.map((target) => latest[target.id]).filter(Boolean);
  if (samples.some((sample) => sample.status === "timeout" || sample.status === "error")) return { status: "bad", label: "异常" };
  if (samples.some((sample) => (sample.rttMs ?? 0) > 120)) return { status: "warn", label: "波动" };
  if (samples.length) return { status: "good", label: "稳定" };
  return { status: "", label: "检测中" };
}

function incidentLabel(type: Incident["type"]): string {
  const labels = {
    high_latency: "高延迟",
    jitter: "抖动",
    timeout: "超时",
    packet_loss: "丢包"
  };
  return labels[type];
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp);
}

createRoot(document.getElementById("root")!).render(<App />);
