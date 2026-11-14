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

for (const file of ["manifest.webmanifest"]) {
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
const boardGameMigration = readFileSync(join(root, "supabase/migrations/20261114015809_authoritative_board_game_moves.sql"), "utf8");
const gamesClient = readFileSync(join(root, "games.js"), "utf8");
assert.match(gamesClient, /functions\.invoke\("gather-board-game-action"/, "Board-game clients must submit move intents to the Edge Function");
assert.doesNotMatch(gamesClient, /rpc\("gather_game_move"/, "Board-game clients must not submit full client-authored states");
assert.match(boardGameFunction, /auth\.getUser\(accessToken\)/, "The board-game endpoint must validate the caller's Supabase session");
assert.match(boardGameFunction, /gather_board_game_commit_move/, "The endpoint must commit through the restricted database RPC");
assert.match(boardGameRules, /Captures must be taken when available/, "Checkers must enforce mandatory captures");
assert.match(boardGameMigration, /revoke execute on function public\.gather_game_move/i, "The legacy client-submitted state RPC must be disabled");

const unoClient = readFileSync(join(root, "uno.js"), "utf8");
const unoCss = readFileSync(join(root, "uno.css"), "utf8");
const unoRematchMigration = readFileSync(join(root, "supabase/migrations/20261114021319_fix_uno_recap_actions_and_standalone_rematch.sql"), "utf8");
const unoRematchOfferRlsMigration = readFileSync(join(root, "supabase/migrations/20261114131141_secure_uno_rematch_offer_table.sql"), "utf8");
const unoRecapLeaveMigration = readFileSync(join(root, "supabase/migrations/20261114133052_preserve_uno_recap_when_player_leaves.sql"), "utf8");
assert.ok(unoClient.includes("finish.append(actions)"), "UNO recap must render its action buttons");
assert.ok(unoClient.includes('alreadyDone?"You are done":"I am done"'), "UNO recap must show the player's done state");
assert.ok(unoClient.includes('state.rematch_pending?"Rematch requested":"Request rematch"'), "UNO recap must show rematch availability");
assert.ok(unoClient.includes('if(g.status==="completed")'), "UNO recap must provide a way back after the lobby closes");
assert.ok(unoClient.includes('call("gather_uno_done"'), "UNO done button must persist the player's confirmation");
assert.ok(unoClient.includes('call("gather_uno_request_rematch"'), "UNO rematch button must create a multiplayer rematch offer");
assert.ok(unoClient.includes('call("gather_uno_respond_rematch"'), "UNO rematch notifications must support accept or decline responses");
assert.ok(unoCss.includes(".uno-finished-panel>.uno-actions"), "UNO recap actions must have dedicated responsive styling");
assert.ok(unoRematchMigration.includes("g.conversation_id is not null"), "UNO rematch access must support both conversation-linked and standalone lobbies");
assert.ok(unoRematchMigration.includes("status = 'joined'"), "UNO rematch requests must require active match membership");
assert.match(unoRematchOfferRlsMigration, /ALTER TABLE private\.gather_uno_rematch_offers\s+ENABLE ROW LEVEL SECURITY/i, "UNO rematch offers must have RLS enabled");
assert.match(unoRematchOfferRlsMigration, /REVOKE ALL ON TABLE private\.gather_uno_rematch_offers\s+FROM PUBLIC, anon, authenticated/i, "UNO rematch offer rows must not be directly accessible to client roles");
assert.match(unoRecapLeaveMigration, /s->>'finished'[\s\S]*s->>'winner_id'/i, "Leaving after an UNO win must preserve the finished recap");
assert.match(unoRecapLeaveMigration, /status\s*=\s*'declined'[\s\S]*UNO rematch cancelled/i, "Leaving with a pending UNO rematch must cancel the offer and notify participants");
assert.match(unoRecapLeaveMigration, /done_map:=coalesce\(s->'done','\{\}'::jsonb\)-auth\.uid\(\)::text/i, "UNO recap completion must be recomputed without the departed player");
const unoMatchLock = unoRecapLeaveMigration.indexOf("SELECT * INTO g", unoRecapLeaveMigration.indexOf("FUNCTION public.gather_uno_respond_rematch"));
const unoOfferLock = unoRecapLeaveMigration.indexOf("SELECT * INTO o", unoRecapLeaveMigration.indexOf("FUNCTION public.gather_uno_respond_rematch"));
assert.ok(unoMatchLock >= 0 && unoOfferLock > unoMatchLock, "UNO rematch response must lock match before offer to keep lifecycle lock order consistent");
assert.match(unoRecapLeaveMigration, /status='joined'[\s\S]*joined_count<>cardinality\(o\.participants\)/i, "UNO rematch start must revalidate that all original participants are still joined");

const partyClient = readFileSync(join(root, "party.js"), "utf8");
const appClient = readFileSync(join(root, "app.js"), "utf8");
const ludoClient = readFileSync(join(root, "ludo.js"), "utf8");
const ludoCloseMigration = readFileSync(join(root, "supabase/migrations/20261114160000_allow_ludo_host_to_close_any_lobby.sql"), "utf8");
const retiredSnakeFunction = readFileSync(join(root, "supabase/functions/gather-snake-action/index.ts"), "utf8");
const retiredGamesMigration = readFileSync(join(root, "supabase/migrations/20261114170000_retire_tag_and_snake_games.sql"), "utf8");

assert.doesNotMatch(html, /(?:tag|snake)\.(?:js|css)|tag-engine\.js/i, "Retired Tag and Snake assets must not load in the app");
assert.doesNotMatch(serviceWorker, /(?:tag|snake)\.(?:js|css)|tag-engine\.js/i, "Retired Tag and Snake assets must not be cached");
assert.doesNotMatch(gamesClient, /gather_tag_|gather_snake_|GatherTag|GatherSnake|snake_arena|Tag Arena|Snake Arena/, "Games hub must expose only turn-based games");
assert.doesNotMatch(partyClient, /gather_tag_|gather_snake_|GatherTag|GatherSnake|snake_arena|Tag Arena|Snake Arena/, "Party Quick Play must expose only supported turn-based multiplayer games");
assert.doesNotMatch(appClient, /GatherTag|GatherSnake|snake_arena|Snake Arena|Tag Arena/, "App lifecycle and notifications must not reference retired games");
assert.match(gamesClient, /table: "gather_multiplayer_games"/, "Games hub must receive multiplayer game changes through Realtime");
assert.match(gamesClient, /table: "gather_multiplayer_players"/, "Games hub must receive multiplayer roster changes through Realtime");
assert.doesNotMatch(gamesClient, /syncRefreshTimer|setInterval\(refreshGamesOnReturn/, "Games hub must not poll on a timer");
assert.match(ludoClient, /table: "gather_multiplayer_games"/, "Ludo must receive turn updates through Realtime");
assert.match(ludoClient, /visibilitychange", refreshOnReturn/, "Ludo must catch up after a suspended tab resumes");
assert.doesNotMatch(ludoClient, /syncTimer|setInterval/, "Ludo must not poll on a timer");
assert.doesNotMatch(partyClient, /setInterval/, "Party list must not poll on a timer");
assert.match(unoClient, /table:\s*"gather_multiplayer_games"/, "UNO must receive game changes through Realtime");
assert.match(unoClient, /visibilitychange",refreshOnReturn/, "UNO must catch up after a suspended tab resumes");
assert.doesNotMatch(unoClient, /setInterval/, "UNO must not poll on a timer");
assert.match(unoClient, /if\(activeGameId!==gameId\)return/, "UNO must ignore stale responses from a previously opened lobby");
assert.match(unoClient, /playerToggle.hidden=!started/, "UNO player controls must not show an inactive Players button in the waiting room");
assert.ok(html.includes("uno.js?v=20261114-uno-event-driven-1") && serviceWorker.includes("./uno.js?v=20261114-uno-event-driven-1"), "UNO event-driven changes must invalidate the cached client asset");
assert.match(retiredSnakeFunction, /status: 410/, "Retired Snake endpoint must return Gone");
assert.match(retiredGamesMigration, /REVOKE ALL PRIVILEGES ON FUNCTION/i, "Retired Tag/Snake RPCs must no longer be callable by client roles");
assert.match(retiredGamesMigration, /gather_tag_|gather_snake_/, "Retirement migration must cover both game RPC families");

assert.match(ludoClient, /rpc\("gather_ludo_cancel"/, "Ludo must expose a host action to close the entire lobby");
assert.match(ludoClient, /if \(isHost\(\)\) root\.append\(closeLobby\(\)\)/, "Ludo host must be able to close an active match lobby");
assert.match(ludoCloseMigration, /v_game\.created_by <> auth\.uid\(\)/, "Only the Ludo host may close the lobby");
assert.match(ludoCloseMigration, /status = 'cancelled'/, "Ludo cancellation must close the lobby for all members");
assert.ok(html.includes("ludo.js?v=20261114-event-driven-ludo-1") && serviceWorker.includes("./ludo.js?v=20261114-event-driven-ludo-1"), "Ludo event-driven changes must invalidate the cached client asset");


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
