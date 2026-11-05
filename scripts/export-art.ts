import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto("http://localhost:5173");
await p.waitForFunction(() => (window as any).__picnic?.renderArt);
mkdirSync("public/art/sheets", { recursive: true });
const clips = await p.evaluate(() => (window as any).__picnic.clips);
const manifest: any = {
  format: "articulated-vector-and-transparent-preview-atlas",
  source: "client/art.ts",
  worldSource: "client/world.ts",
  frame: { width: 128, height: 160, anchor: { x: 64, y: 150 } },
  runtimeRasterization:
    "512×640 for batter/pitcher; 256×320 for fielders. Runtime uses the original vector rig, rather than enlarging preview frames. Upright fixed planes; no orbit-facing billboards.",
  views: ["front", "rear", "side"],
  variations: "Nine cap/number combinations via variation % 9",
  clips,
  atlases: [],
};
for (const food of ["hotdog", "peanut", "popcorn", "watermelon"])
  for (const view of ["front", "rear", "side"]) {
    const data = await p.evaluate(
      ({ food, view }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128 * 12;
        canvas.height = 160 * 11;
        const c = canvas.getContext("2d")!;
        c.scale(0.5, 0.5);
        const api = (window as any).__picnic;
        Object.entries(api.clips).forEach(
          ([clip, spec]: [string, any], row) => {
            for (let frame = 0; frame < 12; frame++) {
              c.save();
              c.translate(frame * 256, row * 320);
              api.renderArt(
                c,
                128,
                300,
                2.1,
                food,
                clip,
                (frame / 11) * spec.duration,
                view,
                0,
                ["pitch", "scoop", "catch", "throw", "tag"].includes(clip),
              );
              c.restore();
            }
          },
        );
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { food, view },
    );
    const path = `public/art/sheets/${food}-${view}.png`;
    writeFileSync(path, Buffer.from(data, "base64"));
    manifest.atlases.push({
      food,
      view,
      path: path.replace("public/", ""),
      columns: 12,
      rows: Object.keys(clips),
      frameSamples:
        "0..duration inclusive; runtime interpolates authored pose keys",
    });
  }
writeFileSync("public/art/manifest.json", JSON.stringify(manifest, null, 2));
await b.close();
