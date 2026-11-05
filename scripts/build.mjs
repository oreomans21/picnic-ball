import { build } from "esbuild";
await build({
  entryPoints: ["server/index.ts"],
  outfile: "build/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: true,
});
