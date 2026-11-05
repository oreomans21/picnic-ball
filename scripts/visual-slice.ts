import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: "evidence/dimensional-slice",
    size: { width: 1440, height: 900 },
  },
});
const p = await ctx.newPage();
const errors: string[] = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await p.goto("http://localhost:5173");
await p.waitForTimeout(2500);
await p.screenshot({ path: "evidence/3d-clubhouse.png" });
await p.click("#practice");
await p.waitForTimeout(3200);
await p.screenshot({ path: "evidence/3d-batting.png" });
const z = await p.evaluate(() => (window as any).__picnic.zone);
await p.mouse.move(z.x, z.y);
await p.waitForFunction(
  () => {
    const s = (window as any).__picnic.state;
    return (
      s.phase === "flight" &&
      s.pitch.arrival - s.t < 0.2 &&
      s.pitch.arrival - s.t > 0.12
    );
  },
  null,
  { polling: "raf", timeout: 20000 },
);
await p.mouse.down();
await p.mouse.up();
await p.waitForTimeout(100);
await p.screenshot({ path: "evidence/3d-contact.png" });
await p.waitForFunction(
  () => !(document.querySelector("#lesson-next") as HTMLButtonElement).disabled,
);
await p.click("#lesson-next");
await p.click('[data-base="1"]');
await p.waitForTimeout(1800);
await p.screenshot({ path: "evidence/3d-running.png" });
await p.waitForTimeout(2700);
await p.screenshot({ path: "evidence/3d-field.png" });
writeFileSync(
  "evidence/3d-slice-report.json",
  JSON.stringify(
    { errors, fps: await p.evaluate(() => (window as any).__picnic.fps) },
    null,
    2,
  ),
);
await ctx.close();
await b.close();
