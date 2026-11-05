import { chromium, firefox, type Page } from "playwright";
import { writeFileSync } from "node:fs";
const root = "http://localhost:5173";
const errors: string[] = [];
async function point(p: Page, x: number, y: number) {
  const box = await p.locator("#game canvas:not(#world-3d)").boundingBox();
  if (!box) throw Error("Missing canvas");
  return {
    x: box.x + (x * box.width) / 1440,
    y: box.y + (y * box.height) / 900,
  };
}
async function clickField(p: Page, x: number, y: number) {
  const q = await point(p, x, y);
  await p.mouse.click(q.x, q.y);
}
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: {
    dir: "evidence/gameplay-video",
    size: { width: 1440, height: 1000 },
  },
});
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(root);
await p.click("#practice");
await p.waitForTimeout(3200);
const swingPoint = await p.evaluate(() => (window as any).__picnic.zone);
await p.mouse.move(swingPoint.x, swingPoint.y);
await p.waitForFunction(
  () => {
    const s = (window as any).__picnic.state;
    return (
      s?.phase === "flight" &&
      s.pitch.arrival - s.t < 0.2 &&
      s.pitch.arrival - s.t > 0.12
    );
  },
  null,
  { timeout: 25000, polling: "raf" },
);
await p.mouse.down();
await p.mouse.up();
await p.waitForFunction(
  () => !(document.querySelector("#lesson-next") as HTMLButtonElement).disabled,
);
await p.screenshot({ path: "evidence/practice-contact.png" });
await p.click("#lesson-next");
await p.locator('[data-base="1"]').click();
await p.waitForFunction(
  () => !(document.querySelector("#lesson-next") as HTMLButtonElement).disabled,
  null,
  { timeout: 12000 },
);
await p.screenshot({ path: "evidence/practice-running.png" });
await p.click("#lesson-next");
await p.locator('[data-throw="1"]:not(:disabled)').waitFor({ timeout: 10000 });
await p.click('[data-throw="1"]');
await p.waitForTimeout(1200);
await p.screenshot({ path: "evidence/practice-throw.png" });
await p.click("#lesson-next");
await p.click('[data-pitch="curveball"]');
const q = await p.evaluate(() => (window as any).__picnic.zone);
await p.mouse.move(q.x, q.y);
await p.mouse.down();
await p.waitForTimeout(1020);
await p.mouse.up();
await p.waitForTimeout(750);
await p.screenshot({ path: "evidence/practice-pitch.png" });
await p.click("#lesson-next");
await p.click("#lesson-next");
await p.setViewportSize({ width: 1280, height: 720 });
await p.screenshot({ path: "evidence/clubhouse-1280.png" });
await p.setViewportSize({ width: 1920, height: 1080 });
await p.waitForTimeout(4000);
const fps = await p.evaluate(() => (window as any).__picnic.fps);
await p.screenshot({ path: "evidence/clubhouse-1920.png" });
await ctx.close();
await b.close();
const compatibility = [];
for (const kind of ["edge", "firefox"] as const) {
  let browser;
  try {
    browser =
      kind === "firefox"
        ? await firefox.launch()
        : await chromium.launch({ channel: "msedge" });
  } catch (e) {
    compatibility.push({ browser: kind, tested: false, reason: String(e) });
    continue;
  }
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  page.on("pageerror", (e) => errors.push(`${kind}: ${e.message}`));
  await page.goto(root);
  await page.click("#practice");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `evidence/${kind}-practice.png` });
  compatibility.push({
    browser: kind,
    version: browser.version(),
    canvas: await page.locator("#game canvas").count(),
  });
  await browser.close();
}
writeFileSync(
  "evidence/browser-report.json",
  JSON.stringify(
    {
      errors,
      fps,
      compatibility,
      practice: "All five steps completed through mouse controls",
    },
    null,
    2,
  ),
);
if (errors.length) throw Error(errors.join("\n"));
