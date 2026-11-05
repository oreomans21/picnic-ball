import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage();
p.on("requestfailed", (r) =>
  console.log("FAILED", r.url(), r.failure()?.errorText),
);
p.on("pageerror", (e) => console.log("ERROR", e.message));
p.on("response", (r) => {
  if (r.status() >= 400) console.log(r.status(), r.url());
});
await p.goto("https://www.google.com/logos/2019/july4th19/r6/july4th19.html");
await p.waitForTimeout(35000);
await p.screenshot({ path: "evidence/reference-diagnostic.png" });
await b.close();
