import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { WebSocketServer, WebSocket } from "ws";
import {
  createGame,
  forfeit,
  input,
  pause,
  resume,
  snapshot,
  tick,
  ballAt,
} from "../shared/engine";
import { encode } from "../shared/wire";
import { CFG } from "../shared/config";
import type { ClientMessage, GameState, ServerMessage } from "../shared/types";
type Seat = {
  token: string;
  ws: WebSocket | null;
  seq: number;
  offset: number;
  rtt: number;
};
type Room = {
  code: string;
  s: GameState;
  seats: Seat[];
  created: number;
  updated: number;
  disconnected: number | null;
  resumeAt: number | null;
  finishedAt: number | null;
  bytesOut: number;
  bytesIn: number;
  framesOut: number;
};
const rooms = new Map<string, Room>(),
  boot = randomBytes(8).toString("hex");
const origins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
).split(",");
const publicOrigin =
  process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_ORIGIN || "";
const distRoot = resolve("dist"),
  cache = new Map<string, { raw: Buffer; gzip: Buffer; type: string }>();
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
let simulation: ReturnType<typeof setInterval> | null = null,
  last = 0,
  acc = 0,
  snapshotAt = 0;
const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        ok: true,
        boot,
        rooms: rooms.size,
        players: [...rooms.values()].reduce(
          (n, r) => n + r.seats.filter((s) => s.ws).length,
          0,
        ),
        simulationRunning: !!simulation,
        tickRate: 60,
        maxRooms: 2,
      }),
    );
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    let rel = decodeURIComponent(
      new URL(req.url || "/", "http://localhost").pathname,
    );
    if (rel === "/") rel = "/index.html";
    const file = resolve(distRoot, "." + rel);
    if (!file.startsWith(distRoot + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let item = cache.get(file);
    if (!item) {
      if (!(await stat(file)).isFile()) throw Error();
      const raw = await readFile(file);
      item = {
        raw,
        gzip: gzipSync(raw),
        type: mime[extname(file)] || "application/octet-stream",
      };
      cache.set(file, item);
    }
    const zipped = req.headers["accept-encoding"]?.includes("gzip"),
      data = zipped ? item.gzip : item.raw;
    res.writeHead(200, {
      "Content-Type": item.type,
      "Cache-Control":
        rel === "/index.html" ? "no-cache" : "public, max-age=3600",
      Vary: "Accept-Encoding",
      ...(zipped ? { "Content-Encoding": "gzip" } : {}),
      "Content-Length": data.length,
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found. Build the frontend with npm run build.");
  }
});
const wss = new WebSocketServer({
  server,
  maxPayload: 2048,
  perMessageDeflate: {
    threshold: 256,
    concurrencyLimit: 2,
    zlibDeflateOptions: { level: 3, memLevel: 4 },
  },
  verifyClient: ({
    origin,
    req,
  }: {
    origin: string;
    req: import("node:http").IncomingMessage;
  }) => {
    if (!origin) return true;
    try {
      return (
        origins.includes(origin) ||
        origin === publicOrigin ||
        new URL(origin).host === req.headers.host
      );
    } catch {
      return false;
    }
  },
});
const clean = (v: unknown) =>
  typeof v === "string"
    ? v
        .replace(/[<>\x00-\x1f]/g, "")
        .trim()
        .slice(0, 20) || "Snack fan"
    : "Snack fan";
const seat = (): Seat => ({
  token: randomBytes(24).toString("hex"),
  ws: null,
  seq: -1,
  offset: 0,
  rtt: 0,
});
function send(ws: WebSocket, m: ServerMessage, r?: Room) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 256_000) {
    const encoded = encode(m);
    if (r) {
      r.bytesOut += Buffer.byteLength(encoded);
      r.framesOut++;
    }
    ws.send(encoded);
  }
}
function stateFor(r: Room, p: number) {
  const s = snapshot(r.s, p);
  if (s.phase === "flight" && r.s.pitch) {
    const pos = ballAt(r.s);
    s.ball.x = pos.x;
    s.ball.y = pos.y;
    s.ball.z = 0;
  }
  return s;
}
function broadcast(r: Room) {
  r.seats.forEach((a, p) => {
    if (a.ws)
      send(
        a.ws,
        { type: "state", state: stateFor(r, p), now: Date.now(), ack: a.seq },
        r,
      );
  });
}
function needsTicks() {
  return [...rooms.values()].some(
    (r) => !["waiting", "finished", "paused"].includes(r.s.phase),
  );
}
function ensureSimulation() {
  if (simulation || !needsTicks()) return;
  last = performance.now();
  acc = 0;
  snapshotAt = last;
  simulation = setInterval(() => {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= 1 / 60) {
      for (const r of rooms.values()) tick(r.s);
      acc -= 1 / 60;
    }
    if (now - snapshotAt >= 50) {
      snapshotAt += 50;
      if (now - snapshotAt > 100) snapshotAt = now;
      for (const r of rooms.values())
        if (!["waiting", "finished", "paused"].includes(r.s.phase))
          broadcast(r);
    }
    for (const r of rooms.values())
      if (r.s.phase === "finished" && !r.finishedAt) {
        r.finishedAt = Date.now();
        broadcast(r);
        console.log(
          JSON.stringify({
            event: "match-bandwidth",
            room: r.code,
            match: r.s.match,
            uncompressedBytesOut: r.bytesOut,
            bytesIn: r.bytesIn,
            snapshots: r.framesOut,
          }),
        );
      }
    if (!needsTicks()) {
      clearInterval(simulation!);
      simulation = null;
    }
  }, 1000 / 60);
  simulation.unref();
}
function attach(r: Room, p: number, ws: WebSocket) {
  const a = r.seats[p];
  a.ws = ws;
  a.seq = -1;
  r.s.players[p].connected = true;
  r.updated = Date.now();
  send(
    ws,
    {
      type: "welcome",
      code: r.code,
      token: a.token,
      player: p,
      state: stateFor(r, p),
    },
    r,
  );
  if (r.s.phase === "paused" && r.s.players.every((x) => x.connected)) {
    r.resumeAt = Date.now() + 3000;
    r.s.message = "Both players are back. Resuming in 3 seconds…";
    const resumeWall = r.resumeAt;
    setTimeout(() => {
      if (r.resumeAt === resumeWall && r.s.players.every((p) => p.connected)) {
        resume(r.s);
        r.resumeAt = null;
        r.disconnected = null;
        broadcast(r);
        ensureSimulation();
      }
    }, 3000).unref();
  }
  broadcast(r);
  ensureSimulation();
}
wss.on("connection", (ws) => {
  let room: Room | null = null,
    player = -1,
    count = 0,
    windowAt = Date.now(),
    joined = false;
  const handshake = setTimeout(() => {
    if (!joined) ws.close(1008, "Join timeout");
  }, 15000);
  (ws as any).alive = true;
  ws.on("pong", () => {
    (ws as any).alive = true;
  });
  ws.on("message", (raw) => {
    const now = Date.now();
    if (now - windowAt > 1000) {
      windowAt = now;
      count = 0;
    }
    if (++count > 65) {
      ws.close(1008, "Input rate exceeded");
      return;
    }
    let m: ClientMessage;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON." });
      return;
    }
    if (!m || typeof m !== "object") return;
    if (room) room.bytesIn += Buffer.byteLength(raw.toString());
    if (m.type === "ping" && Number.isFinite(m.sent)) {
      send(ws, { type: "pong", sent: m.sent, now }, room || undefined);
      return;
    }
    if (!joined && (m.type === "create" || m.type === "join")) {
      if (m.type === "create") {
        if (rooms.size >= 2) {
          send(ws, {
            type: "error",
            message:
              "Both picnic tables are full (two rooms, four players). Try again after a room expires.",
          });
          return;
        }
        let code: string;
        do {
          code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
        } while (rooms.has(code));
        room = {
          code,
          s: createGame([clean(m.name), "Waiting for friend"]),
          seats: [seat(), seat()],
          created: now,
          updated: now,
          disconnected: null,
          resumeAt: null,
          finishedAt: null,
          bytesOut: 0,
          bytesIn: 0,
          framesOut: 0,
        };
        rooms.set(code, room);
        player = 0;
      } else {
        if (typeof m.code !== "string") return;
        room = rooms.get(m.code.toUpperCase()) || null;
        if (!room) {
          send(ws, {
            type: "error",
            message: m.token
              ? "MATCH_LOST: This room no longer exists. The free server may have restarted, or the room expired. In-memory matches cannot be restored. Start a new game."
              : "Room not found or expired. Check the code, or create a new room.",
          });
          return;
        }
        if (m.token) {
          player = room.seats.findIndex((s) => s.token === m.token);
          if (player < 0 || room.seats[player].ws) {
            send(ws, {
              type: "error",
              message:
                "Reconnection token invalid or player already connected.",
            });
            room = null;
            return;
          }
          if (room.s.phase === "finished") {
            send(ws, {
              type: "error",
              message: "MATCH_LOST: This match has ended. Create a new game.",
            });
            room = null;
            return;
          }
        } else {
          player = 1;
          if (
            room.seats[1].ws ||
            room.s.phase !== "waiting" ||
            room.s.players[1].name !== "Waiting for friend"
          ) {
            send(ws, {
              type: "error",
              message: "That room already has two players.",
            });
            room = null;
            return;
          }
          room.s.players[1].name = clean(m.name);
        }
      }
      joined = true;
      clearTimeout(handshake);
      attach(room!, player, ws);
      return;
    }
    if (!room || player < 0) return;
    const a = room.seats[player];
    if (m.type === "clock") {
      if (
        Number.isFinite(m.offset) &&
        Number.isFinite(m.rtt) &&
        Math.abs(m.offset) < 86400000 &&
        m.rtt >= 0 &&
        m.rtt < 10000
      ) {
        a.offset = m.offset;
        a.rtt = m.rtt;
      }
      return;
    }
    if (m.type === "input") {
      if (
        !Number.isSafeInteger(m.seq) ||
        m.seq <= a.seq ||
        !m.input ||
        typeof m.input.type !== "string"
      ) {
        send(
          ws,
          { type: "error", message: "Invalid or duplicate input." },
          room,
        );
        return;
      }
      a.seq = m.seq;
      const i = m.input;
      if (i.type === "swing") {
        if (!Number.isFinite(i.at)) return;
        const age = (now - (i.at + a.offset)) / 1000;
        if (age < -0.02 || age > CFG.rewind + 0.005) {
          send(
            ws,
            {
              type: "error",
              message: "Swing arrived outside the 100 ms timing window.",
            },
            room,
          );
          return;
        }
        i.at = room.s.t - Math.max(0, age);
      }
      if (!input(room.s, player, i))
        send(
          ws,
          { type: "error", message: "That action is not available now." },
          room,
        );
      else {
        room.updated = now;
        if (room.s.phase === "countdown" && room.finishedAt) {
          room.finishedAt = null;
          room.bytesOut = 0;
          room.bytesIn = 0;
          room.framesOut = 0;
        }
        broadcast(room);
        ensureSimulation();
      }
    }
  });
  ws.on("close", () => {
    clearTimeout(handshake);
    if (room && room.seats[player]?.ws === ws) {
      room.seats[player].ws = null;
      room.s.players[player].connected = false;
      if (room.s.phase !== "finished" && room.s.phase !== "waiting") {
        room.disconnected = Date.now();
        room.resumeAt = null;
        pause(room.s, Date.now() + CFG.reconnect * 1000);
        const waitingRoom = room,
          lostAt = room.disconnected;
        setTimeout(() => {
          if (
            waitingRoom.disconnected === lostAt &&
            waitingRoom.s.phase === "paused"
          ) {
            forfeit(
              waitingRoom.s,
              waitingRoom.s.players.findIndex((p) => !p.connected),
            );
            waitingRoom.disconnected = null;
            waitingRoom.finishedAt = Date.now();
            broadcast(waitingRoom);
          }
        }, CFG.reconnect * 1000).unref();
      }
      broadcast(room);
      if (
        ["waiting", "finished"].includes(room.s.phase) &&
        room.seats.every((s) => !s.ws)
      )
        rooms.delete(room.code);
    }
  });
  ws.on("error", () => {});
});
// The 60 Hz simulation and 20 Hz snapshots stop when idle. Only coarse lifecycle checks remain.
setInterval(() => {
  const wall = Date.now();
  for (const r of rooms.values()) {
    if (r.resumeAt && wall >= r.resumeAt) {
      resume(r.s);
      r.resumeAt = null;
      r.disconnected = null;
      broadcast(r);
      ensureSimulation();
    }
    if (r.disconnected && wall - r.disconnected >= CFG.reconnect * 1000) {
      forfeit(
        r.s,
        r.s.players.findIndex((p) => !p.connected),
      );
      r.disconnected = null;
      r.finishedAt = wall;
      broadcast(r);
    }
    if (
      (r.s.phase === "waiting" &&
        wall - r.created > CFG.waitingExpiry * 1000) ||
      (r.finishedAt && wall - r.finishedAt > CFG.finishedExpiry * 1000)
    ) {
      for (const a of r.seats) a.ws?.close(1000, "Room expired");
      rooms.delete(r.code);
    }
  }
  for (const ws of wss.clients) {
    if ((ws as any).alive === false) {
      ws.terminate();
      continue;
    }
    (ws as any).alive = false;
    ws.ping();
  }
}, 5000).unref();
const port = Number(process.env.PORT || 8787);
server.listen(port, "0.0.0.0", () =>
  console.log(
    `Picnic Ball: http://localhost:${port} · HTTP + WebSocket · 2 rooms / 4 players`,
  ),
);
