import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: "evidence/slow-review",
    size: { width: 1440, height: 900 },
  },
});
const p = await ctx.newPage();
await p.goto("http://localhost:5173");
const data = await p.evaluate(async () => {
  document.body.innerHTML =
    '<video style="width:100vw;height:100vh;object-fit:contain;background:#123953" muted controls src="/evidence/visual-slice.webm"></video>';
  const video = document.querySelector("video")!;
  await new Promise((r) => (video.onloadeddata = r));
  const sheet = document.createElement("canvas");
  sheet.width = 1440;
  sheet.height = 1000;
  const c = sheet.getContext("2d")!;
  c.fillStyle = "#123953";
  c.fillRect(0, 0, 1440, 1000);
  for (let i = 0; i < 12; i++) {
    video.currentTime = 3 + i;
    await new Promise((r) => (video.onseeked = r));
    c.drawImage(video, (i % 4) * 360, Math.floor(i / 4) * 330, 360, 225);
    c.fillStyle = "white";
    c.font = "bold 15px sans-serif";
    c.fillText(
      `${i + 3} seconds`,
      (i % 4) * 360 + 12,
      Math.floor(i / 4) * 330 + 250,
    );
  }
  video.currentTime = 5;
  await new Promise((r) => (video.onseeked = r));
  video.playbackRate = 0.25;
  await video.play();
  return sheet.toDataURL("image/png").split(",")[1];
});
writeFileSync("evidence/visual-contact-sheet.png", Buffer.from(data, "base64"));
await p.waitForTimeout(24000);
await p.screenshot({ path: "evidence/slow-review-frame.png" });
await ctx.close();
await b.close();

