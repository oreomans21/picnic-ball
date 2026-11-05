import type { GameState, ServerMessage } from "./types";
const keys = [
  "t",
  "phase",
  "until",
  "inning",
  "half",
  "home",
  "score",
  "innings",
  "balls",
  "strikes",
  "outs",
  "batter",
  "players",
  "runners",
  "fielders",
  "ball",
  "pitch",
  "message",
  "event",
  "eventAt",
  "winner",
  "lastActivity",
  "playRuns",
  "thirdForce",
  "pausedPhase",
  "pauseRemaining",
  "reconnectUntil",
  "match",
  "readyFor",
] as const;
export function pack(s: GameState): unknown[] {
  return keys.map((k) =>
    k === "fielders"
      ? s.fielders.map((f) => [f.x, f.y, f.clip, f.animAt])
      : k === "runners"
        ? s.runners.map((r) => [
            r.id,
            r.p,
            r.origin,
            r.target,
            +r.out,
            +r.scored,
            +r.retouch,
            r.lastBase,
          ])
        : k === "players"
          ? s.players.map((p) => [p.name, +p.connected, +p.ready])
          : s[k],
  );
}
export function unpack(a: unknown[]): GameState {
  const s = Object.fromEntries(
    keys.map((k, i) => [k, a[i]]),
  ) as unknown as GameState;
  s.fielders = (a[14] as any[]).map((f, id) => ({
    id,
    x: f[0],
    y: f[1],
    clip: f[2],
    animAt: f[3],
  }));
  s.runners = (a[13] as any[]).map((r) => ({
    id: r[0],
    p: r[1],
    origin: r[2],
    target: r[3],
    out: !!r[4],
    scored: !!r[5],
    retouch: !!r[6],
    lastBase: r[7],
  }));
  s.players = (a[12] as any[]).map((p) => ({
    name: p[0],
    connected: !!p[1],
    ready: !!p[2],
  }));
  return s;
}
export function encode(m: ServerMessage) {
  return JSON.stringify(
    "state" in m ? { ...m, state: pack(m.state), wire: 1 } : m,
    (_, v) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.round(v * 1000) / 1000
        : v,
  );
}
export function decode(text: string): ServerMessage {
  const m = JSON.parse(text);
  if (m.wire === 1) m.state = unpack(m.state);
  return m;
}
