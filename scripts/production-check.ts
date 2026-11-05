import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const origin = process.env.TEST_ORIGIN || "https://picnic-ball.onrender.com";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const contexts = [
  await browser.newContext({ viewport: { width: 1280, height: 720 } }),
  await browser.newContext({ viewport: { width: 1280, height: 720 } }),
];
const pages = [await contexts[0].newPage(), await contexts[1].newPage()];
const errors: string[] = [],
  sockets: string[] = [],
  attempts: any[] = [];
const initial = await fetch(origin + "/health").then((r) => r.json());
try {
  for (const p of pages) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("websocket", (ws) => sockets.push(ws.url()));
    p.on("response", (r) => {
      if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
    });
    await p.goto(origin, { waitUntil: "networkidle", timeout: 90000 });
  }
  await pages[0].screenshot({ path: "evidence/render-clubhouse.png" });
  await pages[0].fill("#name", "Cloud Mustard");
  await pages[0].click("#create");
  await pages[0].locator(".room-code").waitFor({ timeout: 30000 });
  const code = (await pages[0].locator(".room-code").innerText()).trim();
  await pages[1].fill("#name", "Cloud Peanuts");
  await pages[1].click("#join-toggle");
  await pages[1].fill("#code", code);
  await pages[1].click("#join");
  await pages[1].locator("#ready").waitFor({ timeout: 30000 });
  await pages[0].click("#ready");
  await pages[1].click("#ready");
  await pages[0].waitForFunction(
    () => (window as any).__picnic.state?.phase === "prepare",
    null,
    { timeout: 15000 },
  );
  const initialState = await pages[0].evaluate(
      () => (window as any).__picnic.state,
    ),
    def = initialState.home,
    bat = 1 - def;
  let contact = false,
    runCommand = false,
    throwCommand = false;
  for (const lead of [0.3, 0.25, 0.35, 0.2]) {
    await pages[def].bringToFront();
    await pages[def].waitForFunction(
      () => (window as any).__picnic.state.phase === "prepare",
      null,
      { timeout: 15000 },
    );
    const z = await pages[def].evaluate(() => (window as any).__picnic.zone);
    await pages[def].mouse.move(z.x, z.y);
    await pages[def].mouse.down();
    await pages[def].waitForTimeout(1020);
    await pages[def].mouse.up();
    await pages[bat].bringToFront();
    const aim = await pages[bat].evaluate(() => (window as any).__picnic.zone);
    await pages[bat].mouse.move(aim.x, aim.y - aim.ry * 0.48);
    await pages[bat].waitForFunction(
      (lead) => {
        const s = (window as any).__picnic.state;
        return (
          s.phase === "flight" &&
          s.pitch.arrival - s.t < lead &&
          s.pitch.arrival - s.t > lead - 0.08
        );
      },
      lead,
      { timeout: 8000, polling: "raf" },
    );
    await pages[bat].mouse.down();
    await pages[bat].mouse.up();
    await pages[bat].waitForTimeout(380);
    const after = await pages[bat].evaluate(
      () => (window as any).__picnic.state,
    );
    attempts.push({
      lead,
      phase: after.phase,
      message: after.message,
      pitch: after.pitch,
    });
    if (after.phase === "live") {
      contact = true;
      await pages[bat].locator('[data-base="1"]:not(:disabled)').click();
      await pages[bat].waitForTimeout(350);
      const running = await pages[bat].evaluate(
        () => (window as any).__picnic.state,
      );
      runCommand = running.runners.some((r: any) => r.target === 1 && r.p > 0);
      await pages[bat].screenshot({ path: "evidence/render-online-play.png" });
      await pages[def].bringToFront();
      await pages[def]
        .locator('[data-throw="1"]:not(:disabled)')
        .waitFor({ timeout: 9000 });
      await pages[def].click('[data-throw="1"]');
      throwCommand = true;
      await pages[def].waitForTimeout(1200);
      await pages[def].screenshot({ path: "evidence/render-throw.png" });
      break;
    }
  }
  if (!contact || !runCommand || !throwCommand)
    throw Error(
      `Public contact/run/throw failed: ${JSON.stringify({ contact, runCommand, throwCommand, attempts })}`,
    );
  console.log(
    "Public contact, manual run command and defensive throw verified. Checking disconnect forfeit.",
  );
  await contexts[1].close();
  await pages[0].bringToFront();
  await pages[0].waitForFunction(
    () => (window as any).__picnic.state.phase === "paused",
    null,
    { timeout: 15000 },
  );
  await pages[0].screenshot({ path: "evidence/render-paused.png" });
  await pages[0].waitForFunction(
    () => (window as any).__picnic.state.phase === "finished",
    null,
    { timeout: 70000 },
  );
  await pages[0].screenshot({ path: "evidence/render-forfeit.png" });
  const final = await pages[0].evaluate(() => (window as any).__picnic.state),
    connection = await pages[0].locator("#connection").innerText();
  await contexts[0].close();
  await new Promise((r) => setTimeout(r, 1500));
  const health = await fetch(origin + "/health").then((r) => r.json());
  const report = {
    origin,
    verifiedAt: new Date().toISOString(),
    initial,
    health,
    secureWebSockets: sockets,
    contact,
    runCommand,
    throwCommand,
    attempts,
    forfeit: final.message,
    winner: final.winner,
    connection,
    errors,
    clients:
      "Two independent browser contexts on one computer connecting through the public Render service",
  };
  writeFileSync(
    "evidence/render-verification.json",
    JSON.stringify(report, null, 2),
  );
  if (!sockets.every((u) => u.startsWith("wss://")) || errors.length)
    throw Error(JSON.stringify(report));
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
