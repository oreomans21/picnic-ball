import { BASES, CFG, FIELDERS, PITCHES } from "./config";
import type { Ball, GameState, Input, Phase, Runner, Vec } from "./types";
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const batting = (s: GameState) => (s.half === 0 ? 1 - s.home : s.home);
export const defending = (s: GameState) => 1 - batting(s);
const emptyBall = (): Ball => ({
  x: 0,
  y: 21,
  z: 2,
  vx: 0,
  vy: 0,
  vz: 0,
  holder: 0,
  air: false,
  foul: false,
  caught: false,
  throwTo: null,
  throwAt: 0,
  throwEnd: 0,
  from: { x: 0, y: 0 },
});
export function createGame(
  names = ["Picnic player", "Peanut player"],
  home = Math.random() < 0.5 ? 0 : 1,
): GameState {
  return {
    t: 0,
    phase: "waiting",
    until: 0,
    inning: 1,
    half: 0,
    home,
    score: [0, 0],
    innings: [[], []],
    balls: 0,
    strikes: 0,
    outs: 0,
    batter: 0,
    players: names.map((name) => ({ name, connected: false, ready: false })),
    runners: [],
    fielders: FIELDERS.map((p, id) => ({ ...p, id, clip: "idle", animAt: 0 })),
    ball: emptyBall(),
    pitch: null,
    message: "Two snacks. One diamond. Invite a friend to play.",
    event: 0,
    eventAt: 0,
    winner: null,
    lastActivity: 0,
    playRuns: 0,
    thirdForce: false,
    pausedPhase: null,
    pauseRemaining: 0,
    reconnectUntil: 0,
    match: 1,
    readyFor: [false, false],
  };
}
export function say(s: GameState, message: string) {
  s.message = message;
  s.event++;
  s.eventAt = s.t;
}
function phase(s: GameState, p: Phase, delay = 0) {
  s.phase = p;
  s.until = s.t + delay;
}
function anim(
  s: GameState,
  id: number,
  clip: GameState["fielders"][number]["clip"],
) {
  const f = s.fielders[id];
  if (f) {
    f.clip = clip;
    f.animAt = s.t;
  }
}
export function begin(s: GameState) {
  phase(s, "countdown", CFG.countdown);
  say(s, "Get ready! Away team bats first.");
}
export function prep(s: GameState) {
  s.pitch = null;
  s.ball = emptyBall();
  s.fielders = FIELDERS.map((p, id) => ({
    ...p,
    id,
    clip: "idle",
    animAt: s.t,
  }));
  phase(s, "prepare", CFG.pitchClock);
  say(
    s,
    "Aim inside the box for a strike. Hold, then release near the sweet spot.",
  );
}
export function runnerPos(r: Runner): Vec {
  const p = clamp(r.p, 0, 4),
    i = Math.min(3, Math.floor(p)),
    f = p - i;
  return {
    x: BASES[i].x + (BASES[i + 1].x - BASES[i].x) * f,
    y: BASES[i].y + (BASES[i + 1].y - BASES[i].y) * f,
  };
}
export function forcedBase(s: GameState, r: Runner): number | null {
  if (s.ball.caught || r.out || r.scored) return null;
  if (r.origin === 0) return r.p < 1 ? 1 : null;
  for (let o = 0; o < r.origin; o++)
    if (!s.runners.some((x) => x.origin === o && !x.out && !x.scored))
      return null;
  return r.p < r.origin + 1 ? r.origin + 1 : null;
}
function score(s: GameState, r: Runner) {
  if (r.scored || r.out) return;
  r.scored = true;
  r.target = null;
  s.score[batting(s)]++;
  s.playRuns++;
  const a = s.innings[batting(s)];
  a[s.inning - 1] = (a[s.inning - 1] || 0) + 1;
  say(s, "A snack comes home! One run.");
}
function finish(s: GameState, winner: number, message: string) {
  s.winner = winner;
  s.readyFor = [false, false];
  phase(s, "finished");
  say(s, message);
}
function walkoff(s: GameState) {
  if (
    s.half === 1 &&
    s.inning >= CFG.innings &&
    s.score[s.home] > s.score[1 - s.home]
  ) {
    finish(s, s.home, "Walk-off! The home team wins.");
    return true;
  }
  return false;
}
export function sideChange(s: GameState) {
  s.balls = 0;
  s.strikes = 0;
  s.outs = 0;
  s.runners = [];
  s.pitch = null;
  if (s.half === 0) {
    if (s.inning >= CFG.innings && s.score[s.home] > s.score[1 - s.home]) {
      finish(s, s.home, "Home team wins — no final batting turn needed.");
      return;
    }
    s.half = 1;
  } else {
    if (s.inning >= CFG.innings && s.score[0] !== s.score[1]) {
      finish(
        s,
        s.score[0] > s.score[1] ? 0 : 1,
        "Final out! That’s a ball game.",
      );
      return;
    }
    s.inning++;
    s.half = 0;
  }
  phase(s, "side", 3);
  say(
    s,
    s.inning > 3
      ? "Extra inning! Same rules, empty bases."
      : "Three outs! Switch sides.",
  );
}
export function retire(
  s: GameState,
  r: Runner | null,
  force = false,
  message = "Out!",
) {
  if (r?.out) return;
  if (r) {
    r.out = true;
    r.target = null;
  }
  s.outs++;
  say(s, message);
  if (s.outs >= 3) {
    if (force || (r?.origin === 0 && r.p < 1)) {
      s.score[batting(s)] -= s.playRuns;
      s.innings[batting(s)][s.inning - 1] =
        (s.innings[batting(s)][s.inning - 1] || 0) - s.playRuns;
    }
    s.playRuns = 0;
    sideChange(s);
  }
}
function dead(s: GameState, message: string, newBatter = false) {
  say(s, message);
  if (newBatter) {
    s.balls = 0;
    s.strikes = 0;
    s.batter++;
  }
  phase(s, "dead", 1.6);
}
function strike(s: GameState, message: string) {
  s.strikes++;
  if (s.strikes === 3) {
    s.playRuns = 0;
    retire(s, null, false, "Three strikes — batter out!");
    if (s.phase !== "side" && s.phase !== "finished")
      dead(s, "Strikeout! Three strikes end a batter’s turn.", true);
  } else dead(s, message);
}
export function walk(s: GameState) {
  for (let b = 3; b >= 1; b--) {
    const r = s.runners.find((r) => !r.out && !r.scored && r.p === b);
    if (
      r &&
      Array.from({ length: b }, (_, i) => i + 1).every((n) =>
        s.runners.some((x) => !x.out && !x.scored && x.p === n),
      )
    ) {
      r.p = b + 1;
      r.origin = r.p;
      if (r.p >= 4) score(s, r);
    }
  }
  s.runners.push({
    id: s.batter + 1,
    p: 1,
    origin: 1,
    target: null,
    out: false,
    scored: false,
    retouch: false,
    lastBase: 1,
  });
  if (!walkoff(s)) dead(s, "Four balls — walk! Forced runners advance.", true);
}
function ballCall(s: GameState) {
  s.balls++;
  if (s.balls >= 4) walk(s);
  else dead(s, "Ball — outside the box. Four balls award first base.");
}
export function hit(
  s: GameState,
  quality: number,
  angle: number,
  loft: number,
) {
  const speed = 27 + quality * 25;
  s.ball = {
    ...emptyBall(),
    x: 0,
    y: 0,
    z: 1,
    vx: Math.sin(angle) * speed,
    vy: Math.cos(angle) * speed,
    vz: loft,
    holder: null,
    air: loft > 7,
    foul: Math.abs(angle) > Math.PI / 4,
    caught: false,
  };
  s.runners = s.runners
    .filter((r) => !r.out && !r.scored)
    .map((r) => ({
      ...r,
      origin: Math.round(r.p),
      lastBase: Math.round(r.p),
      target: null,
      retouch: false,
    }));
  s.runners.push({
    id: s.batter + 1,
    p: 0,
    origin: 0,
    target: null,
    out: false,
    scored: false,
    retouch: false,
    lastBase: 0,
  });
  s.playRuns = 0;
  s.lastActivity = s.t;
  phase(s, "live");
  say(
    s,
    quality > 0.85
      ? "Great hit! Click first base to run!"
      : "Ball in play! Click first base to run!",
  );
}
export function ballAt(s: GameState, at = s.t): Vec {
  const p = s.pitch;
  if (!p) return { x: 0, y: 0 };
  const u = clamp((at - p.release) / (p.arrival - p.release), 0, 1);
  const bend = p.kind === "curveball" ? Math.sin(u * Math.PI) * 0.75 : 0;
  return { x: p.target.x * u + bend, y: p.target.y * u };
}
export function input(s: GameState, player: number, i: Input): boolean {
  if (i.type === "ready" && s.phase === "waiting") {
    s.readyFor[player] = true;
    s.players[player].ready = true;
    if (s.players.every((p) => p.connected) && s.readyFor.every(Boolean))
      begin(s);
    return true;
  }
  if (i.type === "rematch" && s.phase === "finished") {
    s.readyFor[player] = true;
    if (s.readyFor.every(Boolean)) {
      const n = createGame(
        s.players.map((p) => p.name),
        1 - s.home,
      );
      n.players = s.players;
      n.players.forEach((p) => (p.ready = true));
      n.t = s.t;
      n.match = s.match + 1;
      Object.assign(s, n);
      begin(s);
    }
    return true;
  }
  if (
    ["paused", "waiting", "countdown", "side", "dead", "finished"].includes(
      s.phase,
    )
  )
    return false;
  if (
    i.type === "hold" &&
    player === defending(s) &&
    s.phase === "prepare" &&
    !s.pitch &&
    Object.hasOwn(PITCHES, i.kind) &&
    Number.isFinite(i.x) &&
    Number.isFinite(i.y)
  ) {
    s.pitch = {
      kind: i.kind,
      target: { x: 0, y: 0 },
      locked: { x: clamp(i.x, -1.45, 1.45), y: clamp(i.y, -1.35, 1.35) },
      start: s.t,
      release: 0,
      arrival: 0,
      swung: false,
      swingAt: null,
      swingAim: { x: 0, y: 0 },
      resolved: false,
      holdAt: s.t,
      power: 0,
    };
    return true;
  }
  if (
    i.type === "release" &&
    player === defending(s) &&
    s.phase === "prepare" &&
    s.pitch?.holdAt != null
  ) {
    const p = s.pitch;
    const v = ((s.t - p.holdAt!) % 1.5) / 1.5;
    const error = (v - 0.68) * 0.72;
    p.target = {
      x: clamp(p.locked.x + error, -1.5, 1.5),
      y: clamp(p.locked.y - error * 0.6, -1.4, 1.4),
    };
    p.power = v;
    p.start = s.t;
    p.release = s.t + 0.72;
    p.arrival = p.release + PITCHES[p.kind].duration * (1.08 - v * 0.18);
    phase(s, "flight");
    anim(s, 0, "pitch");
    say(s, "Pitch on its way. Aim at the ball and click to swing.");
    return true;
  }
  if (
    i.type === "swing" &&
    player === batting(s) &&
    s.phase === "flight" &&
    s.pitch &&
    !s.pitch.swung
  ) {
    const p = s.pitch;
    if (
      ![i.x, i.y, i.at].every(Number.isFinite) ||
      i.at > s.t + 0.02 ||
      i.at < s.t - CFG.rewind - 0.005
    )
      return false;
    p.swung = true;
    p.swingAt = i.at;
    p.swingAim = { x: clamp(i.x, -1.5, 1.5), y: clamp(i.y, -1.5, 1.5) };
    return true;
  }
  if (s.phase !== "live") return false;
  if (
    i.type === "throw" &&
    player === defending(s) &&
    Number.isInteger(i.base) &&
    i.base >= 1 &&
    i.base <= 4 &&
    s.ball.holder !== null &&
    s.ball.throwTo === null
  ) {
    const b = s.ball,
      from = s.fielders[b.holder!];
    anim(s, b.holder!, "throw");
    b.from = { x: from.x, y: from.y };
    b.throwTo = i.base;
    b.throwAt = s.t + 0.38;
    b.throwEnd = b.throwAt + dist(from, BASES[i.base]) / CFG.throwSpeed;
    b.holder = null;
    s.lastActivity = s.t;
    say(s, `Throwing to ${["", "first", "second", "third", "home"][i.base]}!`);
    return true;
  }
  if (player !== batting(s)) return false;
  if (i.type === "advance") {
    let ok = false;
    for (const r of s.runners)
      if (!r.out && !r.scored && !r.retouch) {
        r.target = Math.min(4, Math.floor(r.p + 1.0001));
        ok = true;
      }
    return ok;
  }
  if (i.type === "run" || i.type === "return" || i.type === "stop") {
    const r = s.runners.find((r) => r.id === i.id && !r.out && !r.scored);
    if (!r) return false;
    if (i.type === "stop") {
      r.target = null;
      return true;
    }
    if (i.type === "return") {
      r.target = r.retouch ? r.origin : Math.max(r.origin, Math.floor(r.p));
      return true;
    }
    if (
      !Number.isInteger(i.base) ||
      i.base < 1 ||
      i.base > 4 ||
      i.base < r.origin ||
      r.retouch
    )
      return false;
    if (i.base < r.p) return false;
    r.target = i.base;
    return true;
  }
  return false;
}
function move(p: Vec, to: Vec, speed: number, dt: number) {
  const d = dist(p, to);
  if (d <= speed * dt) {
    p.x = to.x;
    p.y = to.y;
    return;
  }
  p.x += ((to.x - p.x) / d) * speed * dt;
  p.y += ((to.y - p.y) / d) * speed * dt;
}
function forceAt(s: GameState, base: number, holder: number) {
  for (const r of s.runners) {
    if (r.out || r.scored) continue;
    const f = forcedBase(s, r);
    if (f === base && r.p < base - 0.015) {
      retire(s, r, true, "Force out — the runner had to reach this base!");
      anim(s, holder, "tag");
      s.fielders[holder].animAt = s.t - 0.2;
      return;
    }
    if (r.retouch && r.origin === base && r.p !== r.origin) {
      retire(s, r, false, "Out on appeal — the runner did not tag up.");
      anim(s, holder, "tag");
      s.fielders[holder].animAt = s.t - 0.2;
      return;
    }
  }
}
function catchBall(s: GameState, id: number) {
  // Crossing home before a fly is caught does not satisfy tagging up.
  for (const r of s.runners) {
    if (r.scored && r.origin > 0) {
      r.scored = false;
      r.p = 3.999;
      r.target = null;
      s.score[batting(s)]--;
      s.playRuns--;
      s.innings[batting(s)][s.inning - 1] =
        (s.innings[batting(s)][s.inning - 1] || 0) - 1;
    }
  }
  s.ball.holder = id;
  s.ball.caught = true;
  s.ball.z = 1;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.ball.vz = 0;
  if (s.fielders[id].clip !== "catch") anim(s, id, "catch");
  const batter = s.runners.find((r) => r.origin === 0);
  retire(
    s,
    batter || null,
    false,
    s.ball.foul ? "Caught foul! Batter out." : "Fly caught! Batter out.",
  );
  if (s.phase !== "live") return;
  for (const r of s.runners) {
    if (r.out || r.scored) continue;
    r.retouch = r.p !== r.origin;
    if (r.retouch) r.target = null;
  }
  say(s, "Caught! Return to your starting base before advancing (tag up).");
  s.lastActivity = s.t;
}
export function tick(s: GameState, dt = 1 / CFG.tick) {
  if (s.phase === "paused" || s.phase === "waiting" || s.phase === "finished")
    return;
  s.t += dt;
  if (s.phase === "countdown" || s.phase === "side" || s.phase === "dead") {
    if (s.t >= s.until) prep(s);
    return;
  }
  if (s.phase === "prepare") {
    if (s.t >= s.until) {
      s.pitch = null;
      ballCall(s);
    }
    return;
  }
  if (s.phase === "flight") {
    const p = s.pitch;
    if (
      p?.swung &&
      !p.resolved &&
      p.swingAt !== null &&
      s.t >= p.swingAt + 0.18
    ) {
      p.resolved = true;
      const at = p.swingAt + 0.18,
        timing = at - p.arrival,
        pos = ballAt(s, at),
        aim = Math.hypot(p.swingAim.x - pos.x, p.swingAim.y - pos.y);
      if (Math.abs(timing) <= CFG.contactWindow && aim <= CFG.reach) {
        const quality = clamp(1 - aim / 0.9 - Math.abs(timing) * 3, 0, 1),
          angle = clamp(-timing * 7 + p.swingAim.x * 0.24, -1.3, 1.3),
          loft = clamp(10 + quality * 13 + (p.swingAim.y - pos.y) * 16, 2, 30);
        hit(s, quality, angle, loft);
        s.ball.x = pos.x * 3.4;
        s.ball.z = Math.max(0.5, 4.05 - pos.y * 3.4);
        if (Math.abs(timing) > 0.055)
          s.message =
            timing < 0
              ? "Early! Click first base to run."
              : "Late! Click first base to run.";
        return;
      } else
        say(
          s,
          timing < 0 ? "Early — swing and miss." : "Late — swing and miss.",
        );
    }
    if (s.pitch && s.t >= s.pitch.arrival + CFG.rewind + 0.04) {
      if (s.pitch.swung) strike(s, "Swing and miss — strike!");
      else if (
        Math.abs(s.pitch.target.x) <= 1 &&
        Math.abs(s.pitch.target.y) <= 1
      )
        strike(s, "Called strike — the pitch was inside the box.");
      else ballCall(s);
    }
    return;
  }
  if (s.phase !== "live") return;
  const b = s.ball;
  // Runners use a scalar distance around the diamond. Front runners move first.
  const ordered = s.runners
    .filter((r) => !r.out && !r.scored)
    .sort((a, b) => b.p - a.p || b.origin - a.origin);
  for (const r of ordered) {
    if (r.target === null) continue;
    const before = r.p;
    const step = (CFG.runnerSpeed / Math.sqrt(28 * 28 * 2)) * dt;
    let next =
      r.p +
      Math.sign(r.target - r.p) * Math.min(step, Math.abs(r.target - r.p));
    if (next > r.p) {
      const front = ordered
        .filter(
          (x) =>
            x !== r && !x.out && !x.scored && x.origin > r.origin && x.p >= r.p,
        )
        .sort((a, b) => a.p - b.p)[0];
      if (front) next = Math.min(next, front.p - 0.08);
      next = Math.max(r.p, next);
      if (
        Math.abs(next - Math.round(next)) < 0.0001 &&
        ordered.some(
          (x) => x !== r && Math.abs(x.p - next) < 0.02 && !x.out && !x.scored,
        )
      )
        next = r.p;
    }
    r.p = next;
    if (r.p !== before) s.lastActivity = s.t;
    if (Math.abs(r.p - r.target) < 0.0001) {
      r.p = r.target;
      r.target = null;
      r.lastBase = r.p;
      if (r.retouch && r.p === r.origin) r.retouch = false;
      if (r.p >= 4) score(s, r);
    }
  }
  if (b.collect) {
    const action = b.collect,
      f = s.fielders[action.id],
      duration = action.kind === "catch" ? 0.2 : 0.42,
      u = clamp(1 - (action.at - s.t) / duration, 0, 1);
    b.x = action.from.x + (f.x - action.from.x) * u;
    b.y = action.from.y + (f.y - action.from.y) * u;
    b.z = action.from.z + (1 - action.from.z) * u;
    if (s.t >= action.at) {
      delete b.collect;
      if (action.kind === "catch") {
        catchBall(s, f.id);
        return;
      }
      b.holder = f.id;
      b.z = 1;
      s.lastActivity = s.t;
      say(s, "Ball secured! Click a base to throw.");
    }
  } else if (b.throwTo !== null) {
    const base = b.throwTo,
      to = BASES[base];
    const u = clamp((s.t - b.throwAt) / (b.throwEnd - b.throwAt), 0, 1);
    b.x = b.from.x + (to.x - b.from.x) * u;
    b.y = b.from.y + (to.y - b.from.y) * u;
    b.z = 1 + Math.sin(u * Math.PI) * 5;
    const recv = s.fielders
      .filter((f) => f.id !== 0 || base === 4)
      .sort((a, c) => dist(a, to) - dist(c, to))[0];
    move(recv, to, CFG.fielderSpeed, dt);
    if (s.t >= b.throwEnd && dist(recv, to) < 1) {
      b.holder = recv.id;
      b.throwTo = null;
      b.x = to.x;
      b.y = to.y;
      anim(s, recv.id, "catch");
      recv.animAt = s.t - 0.2;
      s.lastActivity = s.t;
      forceAt(s, base, recv.id);
    }
  } else if (b.holder === null) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.vz -= 17 * dt;
    if (b.z <= 0) {
      b.z = 0;
      b.vz = 0;
      b.vx *= Math.pow(0.14, dt);
      b.vy *= Math.pow(0.14, dt);
      if (b.foul) {
        s.runners = s.runners
          .filter((r) => r.origin > 0)
          .map((r) => ({ ...r, p: r.origin, target: null, retouch: false }));
        if (s.strikes < 2) s.strikes++;
        dead(
          s,
          "Foul ball — dead. Runners return. A foul cannot be strike three.",
        );
        return;
      }
    }
    const radius = Math.hypot(b.x, b.y);
    if (radius > 111) {
      if (!b.foul && b.z > 9) {
        for (const r of s.runners) if (!r.out && !r.scored) score(s, r);
        s.runners = [];
        if (!walkoff(s)) dead(s, "Home run! Every runner comes home.", true);
        return;
      }
      const nx = b.x / radius,
        ny = b.y / radius,
        dot = b.vx * nx + b.vy * ny;
      b.vx -= 1.7 * dot * nx;
      b.vy -= 1.7 * dot * ny;
      b.x = nx * 110;
      b.y = ny * 110;
    }
    if (b.y < -12) {
      b.y = -12;
      b.vy = Math.abs(b.vy) * 0.7;
    }
    const landing = {
      x: b.x + b.vx * Math.max(0, b.vz / 17) * 0.55,
      y: b.y + b.vy * Math.max(0, b.vz / 17) * 0.55,
    };
    const f = s.fielders
      .slice()
      .sort((a, c) => dist(a, landing) - dist(c, landing))[0];
    move(f, landing, CFG.fielderSpeed, dt);
    if (f.clip !== "run") {
      anim(s, f.id, "run");
    }
    for (const other of s.fielders) {
      if (other === f) continue;
      const base =
        BASES[other.id === 1 ? 1 : other.id === 2 ? 2 : other.id === 3 ? 3 : 0];
      if (other.id < 4 && dist(other, base) > 1)
        move(other, base, CFG.fielderSpeed * 0.8, dt);
    }
    if (b.z <= 3.5 && (b.z === 0 || b.vz < 0) && dist(f, b) < 4) {
      if (b.air && b.z > 0) {
        b.collect = {
          id: f.id,
          kind: "catch",
          at: s.t + 0.2,
          from: { x: b.x, y: b.y, z: b.z },
        };
        b.vx = 0;
        b.vy = 0;
        b.vz = 0;
        anim(s, f.id, "catch");
        s.lastActivity = s.t;
        return;
      }
      if (b.z === 0 && dist(f, b) < 2) {
        b.collect = {
          id: f.id,
          kind: "scoop",
          at: s.t + 0.42,
          from: { x: b.x, y: b.y, z: b.z },
        };
        b.vx = 0;
        b.vy = 0;
        b.vz = 0;
        anim(s, f.id, "scoop");
        s.lastActivity = s.t;
      }
    }
  } else {
    const f = s.fielders[b.holder];
    b.x = f.x;
    b.y = f.y;
    b.z = 1;
    for (let base = 1; base <= 4; base++)
      if (dist(f, BASES[base]) < 2) forceAt(s, base, f.id);
    if (s.phase !== "live") return;
    for (const r of s.runners) {
      if (
        r.out ||
        r.scored ||
        (r.p === Math.round(r.p) && r.p > 0 && !r.retouch)
      )
        continue;
      if (dist(f, runnerPos(r)) < 2.2) {
        retire(
          s,
          r,
          false,
          "Tag out — the ball reached the runner off a base.",
        );
        anim(s, f.id, "tag");
        f.animAt = s.t - 0.2;
        s.lastActivity = s.t;
        if (s.phase !== "live") return;
      }
    }
  }
  if (s.phase !== "live") return;
  const alive = s.runners.filter((r) => !r.out && !r.scored);
  const safe = alive.every(
    (r) =>
      r.p > 0 &&
      Math.abs(r.p - Math.round(r.p)) < 0.001 &&
      !r.retouch &&
      r.target === null,
  );
  if (
    safe &&
    b.holder !== null &&
    b.throwTo === null &&
    s.t - s.lastActivity > 0.8
  ) {
    if (!walkoff(s)) {
      s.runners = alive.map((r) => ({ ...r, origin: r.p }));
      dead(s, "Play complete. Next batter!", true);
    }
    return;
  }
  if (s.t - s.lastActivity >= CFG.stallEnd) {
    for (const r of alive)
      if (r.p === 0 || r.p !== Math.round(r.p) || r.retouch) {
        retire(
          s,
          r,
          forcedBase(s, r) !== null,
          "Arcade timeout — a runner left between bases is out.",
        );
        if (s.phase !== "live") return;
      }
    s.runners = s.runners.filter((r) => !r.out && !r.scored);
    if (!walkoff(s)) dead(s, "Inactivity ends the play. Next batter.", true);
  }
}
export function pause(s: GameState, until: number) {
  if (s.phase === "waiting" || s.phase === "finished" || s.phase === "paused")
    return;
  s.pausedPhase = s.phase;
  s.pauseRemaining = s.until - s.t;
  s.reconnectUntil = until;
  s.phase = "paused";
  say(s, "Connection lost. Play paused — waiting up to 60 seconds.");
}
export function resume(s: GameState) {
  if (s.phase !== "paused") return;
  /* countdown handled by room wall-clock so simulation remains frozen */ s.phase =
    s.pausedPhase || "prepare";
  s.until = s.t + s.pauseRemaining;
  s.pausedPhase = null;
  say(s, "Reconnected. Play resumes.");
}
export function forfeit(s: GameState, loser: number) {
  s.readyFor = [false, false];
  finish(s, 1 - loser, "Disconnect timeout — opponent wins by forfeit.");
}
export function snapshot(s: GameState, player: number): GameState {
  const copy = structuredClone(s);
  if (player !== defending(s) && copy.pitch) {
    copy.pitch.kind = "fastball";
    copy.pitch.target = { x: 0, y: 0 };
    copy.pitch.locked = { x: 0, y: 0 };
    copy.pitch.holdAt = null;
    copy.pitch.power = 0;
  }
  return copy;
}
