import test from "node:test";
import assert from "node:assert/strict";
import { createGame, hit, input, tick, forcedBase } from "../shared/engine";
function advance(s: ReturnType<typeof createGame>, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) tick(s);
}
test("a grounded ball is automatically scooped and held", () => {
  const s = createGame(["a", "b"], 1);
  hit(s, 0.2, 0, 3);
  s.ball.x = 0;
  s.ball.y = 21;
  s.ball.z = 0;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.ball.vz = 0;
  tick(s);
  assert.equal(s.ball.holder, null);
  advance(s, 0.5);
  assert.equal(s.ball.holder, 0);
  assert.equal(s.fielders[0].clip, "scoop");
});
test("two throws produce a legal double play", () => {
  const s = createGame(["a", "b"], 1);
  s.runners = [
    {
      id: 10,
      p: 1,
      origin: 1,
      target: null,
      out: false,
      scored: false,
      retouch: false,
      lastBase: 1,
    },
  ];
  hit(s, 0.2, 0, 3);
  s.ball.holder = 0;
  input(s, 1, { type: "throw", base: 2 });
  advance(s, 3);
  assert.equal(s.outs, 1);
  assert.equal(s.runners.find((r) => r.id === 10)!.out, true);
  assert.equal(
    forcedBase(
      s,
      s.runners.find((r) => r.origin === 0)!,
    ),
    1,
  );
  input(s, 1, { type: "throw", base: 1 });
  advance(s, 3);
  assert.equal(s.outs, 2);
});
