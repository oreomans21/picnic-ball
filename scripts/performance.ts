import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto("http://localhost:5173");
await p.click("#practice");
await p.waitForTimeout(12000);
const result = await p.evaluate(() => {
  const c = document.getElementById("world-3d") as HTMLCanvasElement,
    gl = c.getContext("webgl2")!,
    ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return {
    fps: (window as any).__picnic.fps,
    backingCanvas: [c.width, c.height],
    viewport: [innerWidth, innerHeight],
    renderer: ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : "Unavailable",
    gpuVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : "Unavailable",
    devicePixelRatio,
    browser: navigator.userAgent,
  };
});
writeFileSync("evidence/performance.json", JSON.stringify(result, null, 2));
await b.close();
