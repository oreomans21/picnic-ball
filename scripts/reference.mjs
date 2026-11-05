import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("https://www.google.com/logos/2019/july4th19/r6/july4th19.html");
await p.waitForTimeout(40000);
await p.screenshot({ path: "evidence/reference-title.png" });
console.log(
  await p.locator("canvas").evaluateAll((e) =>
    e.map((x) => ({
      width: x.width,
      height: x.height,
      rect: x.getBoundingClientRect().toJSON(),
    })),
  ),
);
await p.mouse.click(1110, 568);
await p.waitForTimeout(60000);
await p.screenshot({ path: "evidence/reference-ready.png" });
for (let i = 0; i < 5; i++) {
  await p.mouse.click(640, 620);
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `evidence/reference-play-${i}.png` });
}
await b.close();
