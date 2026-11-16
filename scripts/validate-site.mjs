import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const serviceWorker = readFileSync(join(root, "service-worker.js"), "utf8");
const app = readFileSync(join(root, "app.js"), "utf8");

assert.match(html, /app\.css\?v=/, "Gather app stylesheet must be loaded");
assert.match(html, /design-system\.css\?v=/, "Gather shared design system must be loaded");
assert.match(html, /app\.js\?v=/, "Gather application script must be loaded");
assert.doesNotMatch(html, /games\.js|uno\.js|ludo\.js|dominoes\.js|party\.js|game-chat\.js|game-people-picker|chess\.js|games\//i, "Legacy game scripts and styles must not be loaded");
assert.doesNotMatch(serviceWorker, /games\.js|uno\.js|ludo\.js|dominoes\.js|party\.js|game-chat\.js|game-people-picker|chess\.js|games\//i, "The service worker must not cache legacy game assets");
assert.doesNotMatch(app, /Gather(?:Games|Party|Uno|Ludo|Dominoes)|games-workspace|workspace-switcher|renderGameNotificationCards|uno_invite|uno_rematch|dominoes_invite|notification-game/i, "The core chat client must not retain legacy game integration");

for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const asset = match[1];
  if (/^(?:https?:|data:|#)/i.test(asset)) continue;
  const path = asset.split("?")[0].split("#")[0];
  assert.ok(existsSync(join(root, path)), \`Referenced local asset must exist: \${path}\`);
}

const readReceiptStart = app.indexOf("async function markConversationRead(chatId){");
const readReceiptEnd = app.indexOf("async function markActiveConversationUnread", readReceiptStart);
const readReceiptHandler = app.slice(readReceiptStart, readReceiptEnd);
assert.ok(readReceiptStart >= 0 && readReceiptEnd > readReceiptStart, "Read-receipt handler must remain present");
assert.ok(readReceiptHandler.includes("const wasActive=S.active===chatId;"), "Read-receipt handler must capture the active conversation");
assert.ok(readReceiptHandler.includes("shouldRetryReadRequest"), "Transient read-receipt failures must be retried once");

console.log("Gather site validation passed.");
