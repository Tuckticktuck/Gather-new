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

const snakeClient = readFileSync(join(root, "snake.js"), "utf8");
const snakeCss = readFileSync(join(root, "snake.css"), "utf8");
const snakeFunction = readFileSync(join(root, "supabase/functions/gather-snake-action/index.ts"), "utf8");
const snakeEngine = readFileSync(join(root, "supabase/functions/gather-snake-action/snake-engine.mjs"), "utf8");
const snakeFoundationMigration = readFileSync(join(root, "supabase/migrations/20261114022328_snake_arena_authoritative_multiplayer_foundation.sql"), "utf8");
const snakeLifecycleMigration = readFileSync(join(root, "supabase/migrations/20261114022743_harden_snake_host_and_leave_lifecycle.sql"), "utf8");
const snakeDeclineMigration = readFileSync(join(root, "supabase/migrations/20261114023244_add_snake_arena_invitation_decline.sql"), "utf8");
const snakeSpectatorMigration = readFileSync(join(root, "supabase/migrations/20261114125425_add_read_only_snake_spectator_membership.sql"), "utf8");
const snakeSpectatorDiscoveryMigration = readFileSync(join(root, "supabase/migrations/20261114125529_show_full_snake_lobbies_to_spectators.sql"), "utf8");
const snakeSpectatorLeaveMigration = readFileSync(join(root, "supabase/migrations/20261114125905_allow_spectators_to_leave_finished_snake_matches.sql"), "utf8");
const snakeSpectatorHardeningMigration = readFileSync(join(root, "supabase/migrations/20261114130015_harden_snake_spectator_invitation_checks.sql"), "utf8");
assert.ok(snakeClient.includes('functions.invoke("gather-snake-action"'), "Snake controls must call the JWT-verified action endpoint");
assert.match(snakeClient, /gather_snake_start/, "Snake lobby must use the server-side start RPC");
assert.match(snakeClient, /action:\s*"tick"/, "Snake client must request ticks from the authoritative server endpoint");
assert.doesNotMatch(snakeClient, /gather_multiplayer_update_state/, "Snake must not use client-submitted shared state updates");
assert.ok(snakeFunction.includes("auth.getUser(accessToken)"), "Snake endpoint must verify the Supabase user session");
assert.match(snakeFunction, /gather_snake_commit_tick/, "Snake endpoint must commit authoritative server ticks");
assert.match(snakeEngine, /advanceSnakeState/, "Snake Edge Function must use the authoritative rules engine");
assert.match(snakeFoundationMigration, /gather_snake_record_input/, "Snake migration must define server-validated direction input");
assert.match(snakeLifecycleMigration, /The host must still be in the lobby/, "Snake start must require the host to remain joined");
assert.match(snakeDeclineMigration, /gather_snake_decline/, "Snake invitation decline RPC must exist");
assert.match(snakeSpectatorMigration, /'spectating'::text/, "Snake roster must support a distinct spectator status");
assert.match(snakeSpectatorMigration, /gather_snake_spectate/, "Snake spectator admission must be server-authorized");
assert.match(snakeSpectatorMigration, /status = 'joined'/, "Snake spectators must not be counted as active players");
assert.ok(snakeClient.includes('rpc("gather_snake_spectate"'), "Snake UI must offer a read-only spectator path");
assert.ok(snakeClient.includes('membership?.status === "joined"'), "Only joined players may use the Snake tick driver and game chat");
assert.match(snakeClient, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/, "Snake must refresh after returning to a backgrounded tab");
assert.match(snakeClient, /window\.addEventListener\("online", handleOnline\)/, "Snake must refresh after network connectivity returns");
assert.match(snakeClient, /\.subscribe\(status => \{[\s\S]*?status === "SUBSCRIBED"[\s\S]*?refreshOnResume\(\)/, "Snake must refresh after its Realtime channel reconnects");
assert.match(snakeClient, /function unbindLifecycleEvents\([\s\S]*?removeEventListener\("visibilitychange", handleVisibilityChange\)[\s\S]*?removeEventListener\("online", handleOnline\)/, "Snake must clean up its reconnect listeners on shutdown");
assert.ok(snakeClient.includes("You are observing this match"), "Spectators must see a read-only control state");
assert.ok(indexHtml.includes("snake.js?v=20261114-snake-resume-1") && serviceWorker.includes("./snake.js?v=20261114-snake-resume-1"), "Snake resume changes must invalidate the cached shell asset");
assert.ok(snakeClient.includes('btn(joinedCount >= maxPlayers ? "Lobby full" : "Join as player"'), "Lobby spectators must be able to take an open player seat before the match starts");
assert.match(snakeSpectatorDiscoveryMigration, /gather_snake_open_lobbies/, "Friends must be able to discover full lobbies to spectate");
assert.ok(snakeSpectatorLeaveMigration.includes("v_member.status='spectating'"), "Spectators must be able to leave without changing a finished match");
assert.ok(snakeSpectatorHardeningMigration.includes("coalesce(v_member.status='invited',false)"), "Missing invitations must fail closed when requesting spectator access");
assert.ok(snakeCss.includes(".snake-spectator-banner"), "Snake spectator mode must have a clear visual indicator");
assert.ok(snakeCss.includes(".snake-modal:has(.snake-in-match)"), "Snake gameplay must have responsive full-screen styling");

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
