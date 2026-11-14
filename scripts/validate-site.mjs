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

const party = readFileSync(join(root, "party.js"), "utf8");
const picker = readFileSync(join(root, "game-people-picker.js"), "utf8");
const partyMigration = readFileSync(join(root, "supabase/migrations/20261113235904_harden_party_voting_and_game_chat_cleanup.sql"), "utf8");
const gameMoveMigration = readFileSync(join(root, "supabase/migrations/20261113235906_harden_turn_based_game_results.sql"), "utf8");
assert.match(party, /poll\.my_vote !== null && poll\.my_vote !== undefined/, "Party vote selection must distinguish null from option zero");
assert.match(party, /chat\.kind !== "direct"/, "Two-player Quick Play must require a direct conversation");
assert.match(party, /chat\.members\.length !== 2/, "Two-player Quick Play must require exactly two conversation members");
assert.match(party, /verifyPartyLobbyRoster/, "Quick Play must verify the reused lobby roster");
assert.match(picker, /selected\.size >= selectionLimit/, "The people picker must enforce its selection limit");
assert.match(partyMigration, /m\.role='leader'/, "Party vote creation must require the leader role in SQL");
assert.match(partyMigration, /revoke execute on function public\.gather_game_chat_cleanup\(\)/i, "Trigger-only cleanup RPC must not be directly executable");
assert.match(gameMoveMigration, /v_winner <> v_uid/, "A turn-based player must not declare the opponent the winner");


const boardGameFunction = readFileSync(join(root, "supabase/functions/gather-board-game-action/index.ts"), "utf8");
const boardGameRules = readFileSync(join(root, "supabase/functions/gather-board-game-action/board-rules.mjs"), "utf8");
const boardGameMigration = readFileSync(join(root, "supabase/migrations/20261114120000_authoritative_board_game_moves.sql"), "utf8");
const gamesClient = readFileSync(join(root, "games.js"), "utf8");
assert.match(gamesClient, /functions\.invoke\("gather-board-game-action"/, "Board-game clients must submit move intents to the Edge Function");
assert.doesNotMatch(gamesClient, /rpc\("gather_game_move"/, "Board-game clients must not submit full client-authored states");
assert.match(boardGameFunction, /auth\.getUser\(accessToken\)/, "The board-game endpoint must validate the caller's Supabase session");
assert.match(boardGameFunction, /gather_board_game_commit_move/, "The endpoint must commit through the restricted database RPC");
assert.match(boardGameRules, /Captures must be taken when available/, "Checkers must enforce mandatory captures");
assert.match(boardGameMigration, /revoke execute on function public\.gather_game_move/i, "The legacy client-submitted state RPC must be disabled");

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
