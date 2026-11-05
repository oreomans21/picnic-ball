import { mkdirSync, writeFileSync } from "node:fs";
const response = await fetch(
  "https://api.github.com/repos/google/fonts/contents/ofl/nunitosans",
  { headers: { "User-Agent": "picnic-ball-font-vendor" } },
);
if (!response.ok) throw Error(`Font directory ${response.status}`);
const files = await response.json();
const entry = files.find(
  (f) => f.name.startsWith("NunitoSans[") && f.name.endsWith(".ttf"),
);
if (!entry) throw Error("Variable font not found");
const font = await fetch(entry.download_url);
if (!font.ok) throw Error("Font download failed");
mkdirSync("public/fonts", { recursive: true });
const data = Buffer.from(await font.arrayBuffer());
if (!data.includes(Buffer.from("fvar"))) throw Error("Expected variable font");
writeFileSync("public/fonts/nunito-sans-latin.ttf", data);
const license = await fetch(
  "https://raw.githubusercontent.com/google/fonts/main/ofl/nunitosans/OFL.txt",
);
if (!license.ok) throw Error("Font license download failed");
writeFileSync("public/fonts/OFL.txt", await license.text());
console.log("Vendored Nunito Sans variable Latin font and OFL license.");
