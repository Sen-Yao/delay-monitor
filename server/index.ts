import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStorage } from "./storage.js";
import { Sampler, normalizeTargets } from "./sampler.js";
import { runTraceroute } from "./probes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 8787);

const storage = new JsonStorage(path.resolve(root, "data"));
await storage.init();
const sampler = new Sampler(storage);
await sampler.init();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

    if (url.pathname === "/api/stream") {
      handleStream(req, res);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (isProduction) {
      await serveStatic(req, res, url);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Delay monitor API listening on http://127.0.0.1:${port}`);
});

process.once("SIGINT", () => {
  sampler.close();
  server.close(() => process.exit(0));
});

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  if (req.method === "GET" && url.pathname === "/api/targets") {
    sendJson(res, 200, sampler.getTargets());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, sampler.getSettings());
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const body = await readBody(req);
    sendJson(res, 200, await sampler.setSettings(JSON.parse(body)));
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/targets") {
    const body = await readBody(req);
    const targets = normalizeTargets(JSON.parse(body));
    sendJson(res, 200, await sampler.setTargets(targets));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session/start") {
    sendJson(res, 200, await sampler.startSession());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session/stop") {
    sendJson(res, 200, await sampler.stopSession());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(res, 200, await storage.readSessions());
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
    const sessionId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const sessions = await storage.readSessions();
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      sendJson(res, 404, { error: "Session not found" });
      return;
    }
    const samples = await storage.readSamplesSince(session.start, session.end ?? Date.now());
    const incidents = (await storage.readIncidents()).filter((item) => item.sessionId === session.id);
    sendJson(res, 200, { session, samples, incidents });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/diagnostics/traceroute") {
    const body = JSON.parse(await readBody(req)) as { targetId?: string };
    const target = sampler.getTargets().find((item) => item.id === body.targetId);
    if (!target) {
      sendJson(res, 404, { error: "Target not found" });
      return;
    }
    const result = await runTraceroute(target);
    const results = await storage.readTraceroutes();
    await storage.writeTraceroutes([result, ...results].slice(0, 100));
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    sendJson(res, 200, {
      latest: sampler.getLatest(),
      incidents: sampler.getIncidents(),
      session: sampler.getSession(),
      networkStatus: sampler.getNetworkStatus()
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function handleStream(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  res.write("\n");
  const unsubscribe = sampler.subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  req.on("close", unsubscribe);
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const clientRoot = path.resolve(root, "dist/client");
  const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(clientRoot, `.${safePath}`);
  if (!filePath.startsWith(clientRoot)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  try {
    const buffer = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(buffer);
  } catch {
    const buffer = await readFile(path.join(clientRoot, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(buffer);
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
