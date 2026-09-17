import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import type { LatencySample, TargetConfig, TracerouteHop, TracerouteResult } from "../src/shared/types.js";
import { id } from "./utils.js";

const execFileAsync = promisify(execFile);

export interface ParsedPing {
  status: LatencySample["status"];
  rttMs: number | null;
  packetLoss: number;
  error?: string;
}

export function parsePingOutput(output: string, errorText = ""): ParsedPing {
  const text = `${output}\n${errorText}`;
  const timeMatch = text.match(/time[=<]([\d.]+)\s*ms/);
  const lossMatch = text.match(/([\d.]+)%\s*packet loss/);
  const packetLoss = lossMatch ? Number(lossMatch[1]) / 100 : timeMatch ? 0 : 1;

  if (timeMatch) {
    return {
      status: "ok",
      rttMs: Number(timeMatch[1]),
      packetLoss
    };
  }

  if (/Request timeout|100\.0% packet loss|0 packets received|No route to host/i.test(text)) {
    return {
      status: "timeout",
      rttMs: null,
      packetLoss: packetLoss || 1,
      error: "请求超时或目标未响应"
    };
  }

  return {
    status: "error",
    rttMs: null,
    packetLoss,
    error: firstMeaningfulLine(text) ?? "ping 执行失败"
  };
}

export async function probeTarget(target: TargetConfig): Promise<LatencySample> {
  if (!target.enabled) return makeSample(target.id, "disabled", null, 0, "目标已禁用");
  if (!target.host.trim()) return makeSample(target.id, "unconfigured", null, 0, "目标未配置");

  if (target.method === "tcp") return probeTcp(target);
  return probeIcmp(target);
}

async function probeIcmp(target: TargetConfig): Promise<LatencySample> {
  try {
    const { stdout, stderr } = await execFileAsync("/sbin/ping", ["-c", "1", "-W", "1000", target.host], {
      timeout: 1800
    });
    const parsed = parsePingOutput(stdout, stderr);
    return makeSample(target.id, parsed.status, parsed.rttMs, parsed.packetLoss, parsed.error);
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const parsed = parsePingOutput(err.stdout ?? "", err.stderr ?? err.message ?? "");
    return makeSample(target.id, parsed.status, parsed.rttMs, parsed.packetLoss, parsed.error);
  }
}

async function probeTcp(target: TargetConfig): Promise<LatencySample> {
  const port = target.port ?? 443;
  const started = performance.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (status: LatencySample["status"], error?: string) => {
      socket.destroy();
      const rtt = status === "ok" ? performance.now() - started : null;
      resolve(makeSample(target.id, status, rtt, status === "ok" ? 0 : 1, error));
    };

    socket.setTimeout(1500);
    socket.once("connect", () => finish("ok"));
    socket.once("timeout", () => finish("timeout", "TCP 连接超时"));
    socket.once("error", (error) => finish("error", error.message));
    socket.connect(port, target.host);
  });
}

export async function runTraceroute(target: TargetConfig): Promise<TracerouteResult> {
  const host = target.host.trim();
  if (!host) {
    return {
      id: id("trace"),
      targetId: target.id,
      host,
      timestamp: Date.now(),
      status: "failed",
      hops: [],
      raw: "",
      error: "目标未配置"
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync("/usr/sbin/traceroute", ["-m", "12", "-w", "1", host], {
      timeout: 18000
    });
    const raw = `${stdout}${stderr ? `\n${stderr}` : ""}`;
    const hops = parseTraceroute(raw);
    return {
      id: id("trace"),
      targetId: target.id,
      host,
      timestamp: Date.now(),
      status: hops.some((hop) => hop.address) ? "ok" : "partial",
      hops,
      raw
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const raw = `${err.stdout ?? ""}${err.stderr ? `\n${err.stderr}` : ""}`;
    const hops = parseTraceroute(raw);
    return {
      id: id("trace"),
      targetId: target.id,
      host,
      timestamp: Date.now(),
      status: hops.length > 0 ? "partial" : "failed",
      hops,
      raw,
      error: err.message ?? "traceroute 执行失败"
    };
  }
}

export function parseTraceroute(raw: string): TracerouteHop[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\s+/.test(line))
    .map((line) => {
      const hop = Number(line.match(/^(\d+)/)?.[1] ?? 0);
      const rtts = [...line.matchAll(/([\d.]+)\s*ms/g)].map((match) => Number(match[1]));
      const addrMatch = line.match(/\(([^)]+)\)/);
      const parts = line.split(/\s+/);
      const host = parts[1] === "*" ? null : parts[1] ?? null;
      return {
        hop,
        host,
        address: addrMatch?.[1] ?? null,
        rtts,
        raw: line
      };
    });
}

function makeSample(
  targetId: string,
  status: LatencySample["status"],
  rttMs: number | null,
  packetLoss: number,
  error?: string
): LatencySample {
  return {
    id: id("sample"),
    targetId,
    timestamp: Date.now(),
    status,
    rttMs: rttMs === null ? null : Math.round(rttMs * 10) / 10,
    packetLoss,
    error
  };
}

function firstMeaningfulLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("PING"));
}
