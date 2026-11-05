import { chromium, type Page } from "playwright";
import { writeFileSync } from "node:fs";
const root = process.env.TEST_ORIGIN || "http://localhost:5173";
const b = await chromium.launch({ channel: "chrome", headless: true });
const c0 = await b.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: "evidence/full-match-video",
      size: { width: 1280, height: 720 },
    },
  }),
  c1 = await b.newContext({ viewport: { width: 1280, height: 720 } });
const pages = [await c0.newPage(), await c1.newPage()];
const errors: string[] = [];
let bytes = 0,
  frames = 0;
for (const p of pages) {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("websocket", (ws) =>
    ws.on("framereceived", (event) => {
      bytes += Buffer.byteLength(event.payload);
      frames++;
    }),
  );
  await p.goto(root);
}
await pages[0].fill("#name", "Mighty Mustard");
await pages[0].click("#create");
await pages[0].locator(".room-code").waitFor();
const code = (await pages[0].locator(".room-code").innerText()).trim();
await pages[1].fill("#name", "Peanut Patrol");
await pages[1].click("#join-toggle");
await pages[1].fill("#code", code);
await pages[1].click("#join");
await pages[1].locator("#ready").waitFor();
await pages[0].click("#ready");
await pages[1].click("#ready");
const start = Date.now();
let pitches = 0,
  scored = false,
  home: number | null = null;
const phases = new Set<string>();
async function state() {
  return pages[0].evaluate(() => (window as any).__picnic.state);
}
try {
  while (Date.now() - start < 720000) {
    const s = await state();
    if (!s) {
      await pages[0].waitForTimeout(40);
      continue;
    }
    phases.add(s.phase);
    home = s.home;
    if (s.phase === "finished") break;
    if (s.phase !== "prepare") {
      await pages[0].waitForTimeout(50);
      continue;
    }
    const def = s.half === 0 ? s.home : 1 - s.home,
      bat = 1 - def,
      p = pages[def];
    await p.bringToFront();
    const z = await p.evaluate(() => (window as any).__picnic.zone);
    await p.mouse.move(z.x, z.y);
    await p.mouse.down();
    await p.waitForTimeout(!scored ? 1020 : 100);
    await p.mouse.up();
    pitches++;
    if (!scored) {
      await pages[bat].bringToFront();
      const bz = await pages[bat].evaluate(() => (window as any).__picnic.zone);
      await pages[bat].mouse.move(bz.x, bz.y);
      await pages[bat].waitForFunction(
        () => {
          const s = (window as any).__picnic.state;
          return (
            s.phase === "flight" &&
            s.pitch.arrival - s.t < 0.2 &&
            s.pitch.arrival - s.t > 0.12
          );
        },
        null,
        { polling: "raf", timeout: 5000 },
      );
      await pages[bat].mouse.down();
      await pages[bat].mouse.up();
      await pages[0].waitForTimeout(3400);
      const after = await state();
      if (after.score[0] + after.score[1] > 0) {
        scored = true;
        await pages[bat].screenshot({ path: "evidence/online-home-run.png" });
      } else if (after.phase === "live") {
        const buttons = pages[bat].locator("#all-advance");
        if (await buttons.isVisible()) await buttons.click();
        await pages[0].waitForTimeout(4000);
      }
    }
    if (pitches % 9 === 0) {
      console.log(
        JSON.stringify({
          pitches,
          inning: (await state()).inning,
          score: (await state()).score,
          elapsed: Date.now() - start,
        }),
      );
      await pages[0].screenshot({ path: "evidence/online-match.png" });
    }
    await pages[0]
      .waitForFunction(
        () => {
          const s = (window as any).__picnic.state;
          return s.phase !== "prepare";
        },
        null,
        { timeout: 3000 },
      )
      .catch(() => {});
  }
  const final = await state();
  if (final.phase !== "finished") throw Error("Full match did not finish");
  await pages[0].screenshot({ path: "evidence/online-final.png" });
  await pages[1].screenshot({ path: "evidence/online-final-opponent.png" });
  const oldHome = final.home;
  await pages[0].click("#rematch");
  await pages[1].click("#rematch");
  await pages[0].waitForFunction(
    (h) =>
      (window as any).__picnic.state.phase === "countdown" &&
      (window as any).__picnic.state.home !== h,
    oldHome,
    { timeout: 5000 },
  );
  writeFileSync(
    "evidence/full-match-report.json",
    JSON.stringify(
      {
        durationSeconds: (Date.now() - start) / 1000,
        pitches,
        score: final.score,
        winner: final.winner,
        innings: final.inning,
        phases: [...phases],
        rematchHomeSwapped: true,
        uncompressedPayloadBytesBothPlayers: bytes,
        receivedFrames: frames,
        errors,
        connection:
          "Two independent browser contexts on one computer; no separate-computer test",
      },
      null,
      2,
    ),
  );
} finally {
  await c0.close();
  await c1.close();
  await b.close();
}
