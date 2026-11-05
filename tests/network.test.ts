import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { decode } from "../shared/wire";
const delay = (n: number) => new Promise((r) => setTimeout(r, n));
test("isolated rooms, invalid role, sequence validation, private pitch, pause and token reconnect", async () => {
  const proc = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, PORT: "8788" },
    stdio: "pipe",
  });
  const output: string[] = [];
  proc.stdout.on("data", (d) => output.push(d.toString()));
  await new Promise<void>((resolve, reject) => {
    proc.stdout.on("data", () => resolve());
    proc.once("error", reject);
    setTimeout(() => reject(Error("Server startup timeout")), 8000).unref();
  });
  type Peer = {
    ws: WebSocket;
    messages: any[];
    send: (m: any) => void;
    wait: (predicate: (m: any) => boolean, timeout?: number) => Promise<any>;
  };
  const peers: Peer[] = [];
  async function peer(): Promise<Peer> {
    const ws = new WebSocket("ws://localhost:8788");
    await new Promise((r) => ws.once("open", r));
    const messages: any[] = [];
    ws.on("message", (x) => messages.push(decode(x.toString())));
    const p = {
      ws,
      messages,
      send: (m: any) => ws.send(JSON.stringify(m)),
      wait: async (predicate: (m: any) => boolean, timeout = 8000) => {
        const end = Date.now() + timeout;
        while (Date.now() < end) {
          const i = messages.findIndex(predicate);
          if (i >= 0) return messages.splice(i, 1)[0];
          await delay(10);
        }
        throw Error("Message timeout");
      },
    };
    peers.push(p);
    return p;
  }
  try {
    const a = await peer();
    a.send({ type: "create", name: "Alpha" });
    const aw = await a.wait((m) => m.type === "welcome");
    const other = await peer();
    other.send({ type: "create", name: "Isolated" });
    const ow = await other.wait((m) => m.type === "welcome");
    assert.notEqual(aw.code, ow.code);
    const c = await peer();
    c.send({ type: "join", code: aw.code, name: "Bravo" });
    const cw = await c.wait((m) => m.type === "welcome");
    a.send({ type: "input", seq: 1, input: { type: "ready" } });
    c.send({ type: "input", seq: 1, input: { type: "ready" } });
    const prepared = await a.wait(
      (m) => m.type === "state" && m.state.phase === "prepare",
    );
    const def = prepared.state.home === 0 ? a : c,
      bat = def === a ? c : a;
    bat.send({
      type: "input",
      seq: 2,
      input: { type: "hold", kind: "fastball", x: 0, y: 0 },
    });
    assert.match(
      (await bat.wait((m) => m.type === "error")).message,
      /not available/,
    );
    def.send({
      type: "input",
      seq: 2,
      input: { type: "hold", kind: "curveball", x: 0.4, y: -0.3 },
    });
    await delay(120);
    const pub = await bat.wait((m) => m.type === "state" && m.state.pitch);
    assert.deepEqual(pub.state.pitch.locked, { x: 0, y: 0 });
    assert.equal(pub.state.pitch.holdAt, null);
    assert.equal(pub.state.pitch.kind, "fastball");
    def.send({ type: "input", seq: 2, input: { type: "release" } });
    assert.match(
      (await def.wait((m) => m.type === "error")).message,
      /duplicate/,
    );
    def.send({ type: "input", seq: 3, input: { type: "release" } });
    await a.wait((m) => m.type === "state" && m.state.phase === "flight");
    c.ws.close();
    const paused = await a.wait(
      (m) => m.type === "state" && m.state.phase === "paused",
    );
    await delay(100);
    const back = await peer();
    back.send({ type: "join", code: aw.code, token: cw.token, name: "Bravo" });
    const resumed = await back.wait((m) => m.type === "welcome");
    assert.equal(paused.state.t, resumed.state.t);
    await a.wait((m) => m.type === "state" && m.state.phase !== "paused", 6000);
    const isolated = await other.wait((m) => m.type === "state");
    assert.equal(isolated.state.phase, "waiting");
    assert.equal(isolated.state.players[1].connected, false);
    const fake = await peer();
    fake.send({ type: "join", code: aw.code, token: "forged" });
    assert.match(
      (await fake.wait((m) => m.type === "error")).message,
      /invalid/,
    );
  } finally {
    for (const p of peers) p.ws.close();
    proc.kill();
  }
});
