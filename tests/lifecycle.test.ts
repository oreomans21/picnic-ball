import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";
import { decode } from "../shared/wire";
const delay = (n: number) => new Promise((r) => setTimeout(r, n));
test("four-player capacity, idle timers, 75 ms input latency, late rejection, real 60-second forfeit, restart loss", async () => {
  let proc: ChildProcess;
  const peers: WebSocket[] = [];
  async function launch() {
    proc = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: { ...process.env, PORT: "8789" },
      stdio: "pipe",
    });
    await new Promise<void>((r, j) => {
      proc.stdout!.once("data", () => r());
      proc.once("error", j);
      setTimeout(() => j(Error("Startup timeout")), 8000).unref();
    });
  }
  async function peer() {
    const ws = new WebSocket("ws://localhost:8789");
    peers.push(ws);
    const messages: any[] = [];
    ws.on("message", (d) => messages.push(decode(d.toString())));
    ws.on("error", () => {});
    await new Promise((r) => ws.once("open", r));
    return {
      ws,
      send: (m: any) => ws.send(JSON.stringify(m)),
      wait: async (fn: (m: any) => boolean, timeout = 8000) => {
        const until = Date.now() + timeout;
        while (Date.now() < until) {
          const i = messages.findIndex(fn);
          if (i >= 0) return messages.splice(i, 1)[0];
          await delay(15);
        }
        throw Error("Message wait expired");
      },
    };
  }
  try {
    await launch();
    const health = () =>
      fetch("http://localhost:8789/health").then((r) =>
        r.json(),
      ) as Promise<any>;
    const firstBoot = (await health()).boot;
    assert.equal((await health()).simulationRunning, false);
    const a = await peer();
    a.send({ type: "create", name: "A" });
    const aw = await a.wait((m) => m.type === "welcome");
    const b = await peer();
    b.send({ type: "join", code: aw.code, name: "B" });
    const bw = await b.wait((m) => m.type === "welcome");
    const c = await peer();
    c.send({ type: "create", name: "C" });
    const cw = await c.wait((m) => m.type === "welcome");
    const d = await peer();
    d.send({ type: "join", code: cw.code, name: "D" });
    await d.wait((m) => m.type === "welcome");
    assert.equal((await health()).players, 4);
    assert.equal((await health()).simulationRunning, false);
    const extra = await peer();
    extra.send({ type: "create", name: "Fifth" });
    assert.match((await extra.wait((m) => m.type === "error")).message, /full/);
    a.send({ type: "input", seq: 1, input: { type: "ready" } });
    b.send({ type: "input", seq: 1, input: { type: "ready" } });
    await a.wait((m) => m.type === "state" && m.state.phase === "prepare");
    b.ws.close();
    const paused = await a.wait(
      (m) => m.type === "state" && m.state.phase === "paused",
    );
    await delay(100);
    assert.equal((await health()).simulationRunning, false);
    c.send({ type: "input", seq: 1, input: { type: "ready" } });
    d.send({ type: "input", seq: 1, input: { type: "ready" } });
    const ready = await c.wait(
      (m) => m.type === "state" && m.state.phase === "prepare",
    );
    const def = ready.state.home === 0 ? c : d,
      bat = def === c ? d : c;
    def.send({
      type: "input",
      seq: 2,
      input: { type: "hold", kind: "fastball", x: 0, y: 0 },
    });
    await delay(1020);
    def.send({ type: "input", seq: 3, input: { type: "release" } });
    await bat.wait(
      (m) =>
        m.type === "state" &&
        m.state.phase === "flight" &&
        m.state.pitch.arrival - m.state.t < 0.36,
    );
    await delay(155);
    const at = Date.now();
    await delay(75);
    bat.send({
      type: "input",
      seq: 2,
      input: { type: "swing", x: 0, y: 0, at },
    });
    await bat.wait((m) => m.type === "state" && m.state.phase === "live");
    bat.send({
      type: "input",
      seq: 3,
      input: { type: "swing", x: 0, y: 0, at: Date.now() - 130 },
    });
    assert.match((await bat.wait((m) => m.type === "error")).message, /100 ms/);
    const ended = await a.wait(
      (m) => m.type === "state" && m.state.phase === "finished",
      65000,
    );
    assert.equal(ended.state.winner, 0);
    assert.match(ended.state.message, /forfeit/);
    assert.equal(ended.state.t, paused.state.t);
    a.ws.close();
    await delay(100);
    const fresh = await peer();
    fresh.send({ type: "create", name: "Fresh" });
    await fresh.wait((m) => m.type === "welcome");
    proc!.kill();
    await new Promise((r) => proc!.once("exit", r));
    await launch();
    assert.notEqual((await health()).boot, firstBoot);
    const lost = await peer();
    lost.send({ type: "join", code: aw.code, token: bw.token, name: "B" });
    assert.match(
      (await lost.wait((m) => m.type === "error")).message,
      /MATCH_LOST/,
    );
  } finally {
    peers.forEach((p) => p.close());
    proc!?.kill();
  }
});
