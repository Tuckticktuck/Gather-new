import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const serviceWorker = readFileSync(join(root, "service-worker.js"), "utf8");
const base = "https://gather.test/Gather-new/";

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicates)], [], "index.html contains duplicate element IDs");

const localAssets = [];
for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
  const tag = match[0];
  const ref = tag.match(/(?:src|href)=["']([^"']+)["']/i)?.[1];
  if (!ref || /^(?:https?:)?\/\//i.test(ref) || ref.startsWith("data:")) continue;
  if (!/\.(?:js|css|svg|webmanifest|png)(?:[?#]|$)/i.test(ref)) continue;
  localAssets.push(ref);
}

for (const ref of localAssets) {
  const url = new URL(ref, base);
  const relativePath = url.pathname.replace(/^\/Gather-new\//, "");
  assert.ok(existsSync(join(root, relativePath)), "Missing local asset: " + ref);
}

const shellBlock = serviceWorker.match(/const SHELL_URLS = \[([\s\S]*?)\]\.map/);
assert.ok(shellBlock, "service-worker.js has no SHELL_URLS list");
const shellRefs = [...shellBlock[1].matchAll(/["']([^"']+)["']/g)].map(match => match[1]);
const shellSet = new Set(shellRefs.map(ref => {
  const url = new URL(ref, base);
  return url.pathname + url.search;
}));
for (const ref of localAssets) {
  const url = new URL(ref, base);
  assert.ok(shellSet.has(url.pathname + url.search), "Service worker shell is missing current asset version: " + ref);
}

for (const file of ["manifest.webmanifest", "tsconfig.tag.json"]) {
  JSON.parse(readFileSync(join(root, file), "utf8"));
}

const cssFiles = localAssets.filter(ref => /\.css(?:[?#]|$)/i.test(ref));
for (const ref of cssFiles) {
  const url = new URL(ref, base);
  const relativePath = url.pathname.replace(/^\/Gather-new\//, "");
  const css = readFileSync(join(root, relativePath), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const opens = (css.match(/{/g) || []).length;
  const closes = (css.match(/}/g) || []).length;
  assert.equal(opens, closes, "Unbalanced CSS braces in " + relativePath);
}

console.log("Static validation passed: " + ids.length + " unique HTML IDs, " + localAssets.length + " local assets, " + cssFiles.length + " CSS files, service-worker asset versions aligned.");
