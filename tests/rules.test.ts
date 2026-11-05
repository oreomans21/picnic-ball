import test from "node:test";
import assert from "node:assert/strict";
import {
  batting,
  begin,
  createGame,
  defending,
  forcedBase,
  hit,
  input,
  pause,
  prep,
  resume,
  retire,
  sideChange,
  tick,
  walk,
} from "../shared/engine";
import type { GameState, Runner } from "../shared/types";
const ready = () => {
  const s = createGame(["A", "B"], 1);
  s.players.forEach((p) => (p.connected = true));
  input(s, 0, { type: "ready" });
  input(s, 1, { type: "ready" });
  return s;
};
const run = (s: GameState, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) tick(s);
};
const runner = (id: number, p: number, origin = p): Runner => ({
  id,
  p,
  origin,
  target: null,
  out: false,
  scored: false,
  retouch: false,
  lastBase: p,
});
test("both players must be ready, then three-second countdown", () => {
  const s = createGame(["a", "b"], 1);
  s.players.forEach((p) => (p.connected = true));
  assert.equal(
    input(s, 0, { type: "hold", kind: "fastball", x: 0, y: 0 }),
    false,
  );
  input(s, 0, { type: "ready" });
  assert.equal(s.phase, "waiting");
  input(s, 1, { type: "ready" });
  assert.equal(s.phase, "countdown");
  run(s, 3.1);
  assert.equal(s.phase, "prepare");
  assert.equal(batting(s), 0);
});
test("roles and pitch state are enforced; 12-second violation awards a ball", () => {
  const s = ready();
  run(s, 3.1);
  assert.equal(
    input(s, 0, { type: "hold", kind: "fastball", x: 0, y: 0 }),
    false,
  );
  run(s, 12.1);
  assert.equal(s.balls, 1);
  assert.equal(s.phase, "dead");
});
test("three called strikes retire the batter; counts reset", () => {
  const s = ready();
  prep(s);
  for (let n = 0; n < 3; n++) {
    input(s, 1, { type: "hold", kind: "fastball", x: 0, y: 0 });
    run(s, 1.02);
    input(s, 1, { type: "release" });
    run(s, 3.7);
  }
  assert.equal(s.outs, 1);
  assert.equal(s.strikes, 0);
  assert.equal(s.balls, 0);
});
test("walk advances only the forced chain", () => {
  const s = ready();
  s.runners = [runner(10, 1), runner(11, 3)];
  walk(s);
  assert.deepEqual(
    s.runners
      .filter((r) => !r.scored)
      .map((r) => r.p)
      .sort(),
    [1, 2, 3],
  );
  assert.equal(s.score[0], 0);
});
test("bases-loaded walk scores one run", () => {
  const s = ready();
  s.runners = [runner(10, 1), runner(11, 2), runner(12, 3)];
  walk(s);
  assert.equal(s.score[0], 1);
  assert.deepEqual(
    s.runners
      .filter((r) => !r.scored)
      .map((r) => r.p)
      .sort(),
    [1, 2, 3],
  );
});
test("manual runner starts stopped; persistent command reaches first and stops", () => {
  const s = ready();
  hit(s, 0.2, 0, 3);
  const r = s.runners[0];
  assert.equal(r.p, 0);
  assert.equal(r.target, null);
  s.ball.holder = 7;
  s.fielders[7] = { ...s.fielders[7], x: 80, y: 80 };
  assert.equal(input(s, 0, { type: "run", id: r.id, base: 1 }), true);
  run(s, 4);
  assert.equal(r.p, 1);
  assert.equal(r.target, null);
});
test("stop and return commands work between bases", () => {
  const s = ready();
  hit(s, 0.2, 0, 3);
  s.ball.holder = 7;
  input(s, 0, { type: "run", id: s.runners[0].id, base: 1 });
  run(s, 1);
  const r = s.runners[0],
    p = r.p;
  input(s, 0, { type: "stop", id: r.id });
  run(s, 0.5);
  assert.equal(r.p, p);
  input(s, 0, { type: "return", id: r.id });
  run(s, 1.2);
  assert.equal(r.p, 0);
});
test("runners cannot pass or occupy the same base", () => {
  const s = ready();
  s.phase = "live";
  s.ball.holder = 7;
  s.runners = [runner(1, 0.9, 0), runner(2, 1, 1)];
  input(s, 0, { type: "run", id: 1, base: 2 });
  run(s, 2);
  assert.ok(s.runners[0].p < 1);
});
test("force persists when trailing runner reaches first; removing trailer removes force", () => {
  const s = ready();
  s.phase = "live";
  s.runners = [runner(1, 1, 0), runner(2, 1.4, 1)];
  assert.equal(forcedBase(s, s.runners[1]), 2);
  s.runners[0].out = true;
  assert.equal(forcedBase(s, s.runners[1]), null);
});
test("throw is committed and force out at first resolves", () => {
  const s = ready();
  hit(s, 0.4, 0, 5);
  s.ball.holder = 0;
  s.fielders[0].x = 0;
  s.fielders[0].y = 21;
  assert.equal(input(s, 1, { type: "throw", base: 1 }), true);
  assert.equal(input(s, 1, { type: "throw", base: 2 }), false);
  run(s, 3);
  assert.equal(s.outs, 1);
});
test("tag out is automatic off a base", () => {
  const s = ready();
  hit(s, 0.4, 0, 5);
  const r = s.runners[0];
  r.p = 0.5;
  s.ball.holder = 0;
  s.fielders[0].x = 14;
  s.fielders[0].y = 14;
  tick(s);
  assert.equal(r.out, true);
  assert.equal(s.outs, 1);
});
test("two-strike uncaught foul remains two strikes and restores runners", () => {
  const s = ready();
  s.strikes = 2;
  s.runners = [runner(40, 1)];
  hit(s, 0.1, 1.2, 2);
  s.fielders.forEach((f) => {
    f.x = -100;
    f.y = 100;
  });
  run(s, 0.9);
  assert.equal(s.strikes, 2);
  assert.equal(s.phase, "dead");
  assert.deepEqual(
    s.runners.map((r) => r.p),
    [1],
  );
});
test("fair and foul airborne catches retire batter and require retouch", () => {
  for (const foul of [false, true]) {
    const s = ready();
    s.runners = [runner(40, 1)];
    hit(s, 0.5, foul ? 1 : 0, 15);
    s.runners[0].p = 1.2;
    s.ball = { ...s.ball, x: 20, y: 30, z: 3, vz: -5, vx: 0, vy: 0, foul };
    s.fielders[0].x = 20;
    s.fielders[0].y = 30;
    tick(s);
    run(s, 0.22);
    assert.equal(s.outs, 1);
    assert.equal(s.ball.caught, true);
    assert.equal(s.runners[0].retouch, true);
    assert.equal(input(s, 0, { type: "run", id: 40, base: 2 }), false);
    input(s, 0, { type: "return", id: 40 });
    s.fielders[0].x = 80;
    run(s, 1);
    assert.equal(s.runners[0].retouch, false);
  }
});
test("third force out cancels earlier runs; time play retains earlier run", () => {
  for (const force of [false, true]) {
    const s = ready();
    s.phase = "live";
    s.outs = 2;
    s.score[0] = 1;
    s.playRuns = 1;
    s.innings[0][0] = 1;
    const r = runner(1, 2.5, 2);
    s.runners = [r];
    retire(s, r, force);
    assert.equal(s.score[0], force ? 0 : 1);
    assert.equal(s.half, 1);
  }
});
test("third out on batter before first cancels runs", () => {
  const s = ready();
  s.phase = "live";
  s.outs = 2;
  s.score[0] = 1;
  s.playRuns = 1;
  s.innings[0][0] = 1;
  retire(s, runner(1, 0.4, 0));
  assert.equal(s.score[0], 0);
});
test("home run automatically scores all runners", () => {
  const s = ready();
  s.runners = [runner(20, 1), runner(21, 3)];
  hit(s, 1, 0, 27);
  s.ball.x = 0;
  s.ball.y = 112;
  s.ball.z = 20;
  tick(s);
  assert.equal(s.score[0], 3);
  assert.equal(s.phase, "dead");
});
test("stall does not reset runner between bases before timeout", () => {
  const s = ready();
  hit(s, 0.4, 0, 5);
  s.runners[0].p = 0.5;
  s.ball.holder = 7;
  s.fielders[7].x = 80;
  run(s, 9);
  assert.equal(s.phase, "live");
  run(s, 4.1);
  assert.equal(s.outs, 1);
  assert.equal(s.phase, "dead");
});
test("sides clear bases and counts; final home turn may be skipped", () => {
  const s = ready();
  s.inning = 3;
  s.score = [0, 1];
  s.runners = [runner(3, 2)];
  s.balls = 2;
  s.strikes = 1;
  sideChange(s);
  assert.equal(s.phase, "finished");
  assert.equal(s.winner, 1);
  assert.equal(s.runners.length, 0);
});
test("extra innings have empty bases; walk-off ends game", () => {
  const s = ready();
  s.inning = 3;
  s.half = 1;
  sideChange(s);
  assert.equal(s.inning, 4);
  assert.equal(s.half, 0);
  assert.equal(s.runners.length, 0);
  s.half = 1;
  s.runners = [runner(4, 3)];
  hit(s, 1, 0, 27);
  s.ball.y = 112;
  s.ball.z = 20;
  tick(s);
  assert.equal(s.phase, "finished");
  assert.equal(s.winner, 1);
});
test("pause freezes timeline; resume preserves pending pitch", () => {
  const s = ready();
  prep(s);
  input(s, 1, { type: "hold", kind: "curveball", x: 0.2, y: 0.3 });
  run(s, 1);
  input(s, 1, { type: "release" });
  run(s, 0.5);
  const t = s.t;
  pause(s, Date.now() + 60000);
  run(s, 5);
  assert.equal(s.t, t);
  resume(s);
  assert.equal(s.phase, "flight");
  assert.equal(s.pitch?.kind, "curveball");
});
test("rematch requires both players and swaps home assignment", () => {
  const s = ready();
  s.phase = "finished";
  s.readyFor = [false, false];
  input(s, 0, { type: "rematch" });
  assert.equal(s.phase, "finished");
  input(s, 1, { type: "rematch" });
  assert.equal(s.phase, "countdown");
  assert.equal(s.home, 0);
  assert.equal(s.match, 2);
});
test("swing timestamp window rejects old input and duplicate swings", () => {
  const s = ready();
  prep(s);
  input(s, 1, { type: "hold", kind: "fastball", x: 0, y: 0 });
  run(s, 1.02);
  input(s, 1, { type: "release" });
  run(s, 0.9);
  assert.equal(
    input(s, 0, { type: "swing", x: 0, y: 0, at: s.t - 0.2 }),
    false,
  );
  assert.equal(input(s, 0, { type: "swing", x: 0, y: 0, at: s.t }), true);
  assert.equal(input(s, 0, { type: "swing", x: 0, y: 0, at: s.t }), false);
});
