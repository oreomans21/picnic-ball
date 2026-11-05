import test from "node:test";
import assert from "node:assert/strict";
import { createGame, prep, input, tick } from "../shared/engine";
import { encode, decode } from "../shared/wire";
test("a swing resolves at its authored contact marker, independent of render rate", () => {
  const s = createGame(["A", "B"], 1);
  prep(s);
  input(s, 1, { type: "hold", kind: "fastball", x: 0, y: 0 });
  for (let n = 0; n < 61; n++) tick(s);
  input(s, 1, { type: "release" });
  while (s.t < s.pitch!.arrival - 0.18) tick(s);
  input(s, 0, { type: "swing", x: 0, y: 0, at: s.t });
  assert.equal(s.phase, "flight");
  for (let n = 0; n < 10; n++) tick(s);
  assert.equal(s.phase, "flight");
  for (let n = 0; n < 2; n++) tick(s);
  assert.equal(s.phase, "live");
  assert.equal(s.pitch!.resolved, true);
});
test("compact snapshot transport round-trips gameplay state", () => {
  const state = createGame(["A", "B"], 1);
  const wire = encode({ type: "state", state, now: 1234, ack: 2 });
  const restored = decode(wire);
  assert.equal(restored.type, "state");
  if (restored.type === "state") {
    assert.deepEqual(restored.state, state);
  }
  assert.ok(
    wire.length <
      JSON.stringify({ type: "state", state, now: 1234, ack: 2 }).length,
  );
});
