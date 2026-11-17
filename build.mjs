import { build } from "esbuild";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
mkdirSync("docs", { recursive: true });
await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  outfile: "docs/app.js",
  logLevel: "info",
});
cpSync("index.html", "docs/index.html");
cpSync("ja.html", "docs/ja.html");
cpSync("en.html", "docs/en.html");
cpSync("src/style.css", "docs/style.css");
writeFileSync("docs/CNAME", "staking.id42.win");
console.log("docs/ ready");
