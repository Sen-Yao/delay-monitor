import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NetworkStatus } from "../src/shared/types.js";

const execFileAsync = promisify(execFile);

export async function getNetworkStatus(): Promise<NetworkStatus> {
  const [routes, ifconfig] = await Promise.all([safeExec("/usr/sbin/netstat", ["-rn", "-f", "inet"]), safeExec("/sbin/ifconfig", [])]);
  const defaultLine = routes.split("\n").find((line) => line.trim().startsWith("default"));
  const routeParts = defaultLine?.trim().split(/\s+/) ?? [];
  const defaultGateway = routeParts[1] ?? null;
  const activeInterface = routeParts[routeParts.length - 1] ?? null;
  const tunInterfaces = [...ifconfig.matchAll(/^(utun\d+):/gm)].map((match) => match[1]);
  const hasProxyLikeRoute = /198\.18\.0\.1|utun\d+/.test(routes) || tunInterfaces.length > 0;
  const notes: string[] = [];

  if (hasProxyLikeRoute) {
    notes.push("检测到 TUN/代理类路由，公网或游戏延迟可能被代理路径影响。");
  }

  if (defaultGateway) {
    notes.push(`默认网关 ${defaultGateway}${activeInterface ? ` / ${activeInterface}` : ""}`);
  }

  return {
    checkedAt: Date.now(),
    defaultGateway,
    activeInterface,
    tunInterfaces,
    hasProxyLikeRoute,
    notes
  };
}

async function safeExec(file: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, { timeout: 3000 });
    return `${stdout}${stderr ? `\n${stderr}` : ""}`;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return `${err.stdout ?? ""}${err.stderr ? `\n${err.stderr}` : ""}${err.message ? `\n${err.message}` : ""}`;
  }
}
