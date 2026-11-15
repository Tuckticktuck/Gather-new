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
const battleshipModule = readFileSync(join(root, "games/modules/battleship/index.mjs"), "utf8");
assert.match(gamesClient, /functions\.invoke\("gather-board-game-action"/, "Board-game clients must submit move intents to the Edge Function");
assert.doesNotMatch(gamesClient, /rpc\("gather_game_move"/, "Board-game clients must not submit full client-authored states");
assert.match(boardGameFunction, /auth\.getUser\(accessToken\)/, "The board-game endpoint must validate the caller's Supabase session");
assert.match(boardGameFunction, /gather_board_game_commit_move/, "The endpoint must commit through the restricted database RPC");
assert.match(boardGameRules, /Captures must be taken when available/, "Checkers must enforce mandatory captures");
assert.match(boardGameMigration, /revoke execute on function public\.gather_game_move/i, "The legacy client-submitted state RPC must be disabled");

const boardGameModules = readFileSync(join(root, "games/modules/legacy-board-modules.mjs"), "utf8");
assert.ok(gamesClient.includes('import("./games/core/index.mjs")'), "Migrated board games must initialize the shared game core");
assert.ok(gamesClient.includes("runtime.lobbyService.create(gameType"), "Migrated board game creation must use the shared lifecycle service");
assert.ok(gamesClient.includes("runtime.lobbyService.watch("), "Migrated board games must use match-scoped canonical Realtime synchronization");
assert.ok(gamesClient.includes("gameModule.renderMatch("), "Migrated board games must render through registered modules");
assert.ok(gamesClient.includes('import("./games/modules/battleship/index.mjs")'), "Battleship must load its registered game module");
assert.ok(gamesClient.includes("module.action(game.id, action, payload)"), "Battleship actions must route through its module");
assert.doesNotMatch(gamesClient, /ctx\.db\.rpc\("gather_game_battleship_(?:private_state|action)"/, "Battleship screen must not bypass the module for private state or actions");
assert.ok(battleshipModule.includes("canPerformMatchCommand") && battleshipModule.includes("loadPrivateState") && battleshipModule.includes("driver.action"), "Battleship module must use shared permission and dedicated action boundaries");
assert.equal((serviceWorker.match(/"\.\/games\/modules\/battleship\/index\.mjs"/g) || []).length, 2, "Battleship module must be present in both offline cache lists");
assert.ok(html.includes("games.js?v=20261115-battleship-shared-engine-1") && serviceWorker.includes("./games.js?v=20261115-battleship-shared-engine-1"), "Battleship client asset versions must align");
assert.ok(boardGameModules.includes('createModule("tic_tac_toe"'), "Tic-Tac-Toe must have its own game module");
assert.ok(boardGameModules.includes('createModule("connect_four"'), "Connect Four must have its own game module");
assert.ok(boardGameModules.includes("apiVersion: 1"), "Migrated modules must use the versioned module contract");
assert.ok(gamesClient.includes('functions.invoke("gather-board-game-action"'), "Migrated board moves must remain server-validated");


const unoClient = readFileSync(join(root, "uno.js"), "utf8");
const unoCss = readFileSync(join(root, "uno.css"), "utf8");
const unoHouseRulesMigration = readFileSync(join(root, "supabase/migrations/20261114180000_uno_host_house_rules.sql"), "utf8");
assert.match(unoHouseRulesMigration, /FUNCTION public\.gather_uno_set_house_rules/i, "UNO house rules must have a dedicated host-only RPC");
assert.match(unoHouseRulesMigration, /v_game\.created_by <> auth\.uid\(\)/i, "Only the host may save UNO house rules");
assert.match(unoHouseRulesMigration, /starting_hand_size[\s\S]*draw_until_playable[\s\S]*wild4_anytime/i, "UNO host rules must cover the configured hand size, draw-until-playable, and Wild Draw Four override");
assert.match(unoHouseRulesMigration, /v_hand_size/i, "UNO starting hand size must be applied by the authoritative start function");
assert.match(unoHouseRulesMigration, /cards_drawn[\s\S]*Your turn was passed/i, "Draw-until-playable must be resolved by the authoritative action function");
assert.match(unoHouseRulesMigration, /skipturn:=\(n=2\)/i, "UNO Reverse must only skip the next turn in a two-player game");
assert.ok(unoClient.includes("gather_uno_set_house_rules") && unoClient.includes("uno-house-rules"), "UNO lobby must expose host controls for shared house rules");
assert.ok(unoClient.includes("ruleSummary") && unoClient.includes("wild4_anytime"), "UNO lobby and active game must display the shared rule configuration");
const unoHouseRulesFollowup = readFileSync(join(root, "supabase/migrations/20261114185000_uno_house_rules_late_join_and_ready_reset.sql"), "utf8");
assert.match(unoHouseRulesFollowup, /for i in 1\.\.[\s\S]*starting_hand_size/i, "Late-joining UNO players must receive the configured starting hand size");
assert.match(unoHouseRulesFollowup, /SET ready = false[\s\S]*status = 'joined'/i, "Changing UNO house rules must clear existing ready confirmations");
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
assert.ok(partyClient.includes("members.length > 10") && partyClient.includes("p_max_players: members.length"), "UNO Quick Play must enforce the 10-player maximum");
assert.ok(unoClient.includes("joined.some(p=>!p.ready)") && unoClient.includes("start.disabled"), "UNO start must remain disabled until every joined player, including the host, is ready");
const appClient = readFileSync(join(root, "app.js"), "utf8");
const ludoClient = readFileSync(join(root, "ludo.js"), "utf8");
const ludoModule = readFileSync(join(root, "games/modules/ludo/index.mjs"), "utf8");
const ludoCss = readFileSync(join(root, "ludo.css"), "utf8");
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
assert.ok(html.includes("uno.js?v=20261114-shared-engine-1") && serviceWorker.includes("./uno.js?v=20261114-shared-engine-1"), "UNO shared-engine client changes must invalidate the cached asset");
assert.ok(html.includes("uno.css?v=20261114-adaptive-table-1") && serviceWorker.includes("./uno.css?v=20261114-adaptive-table-1"), "UNO arcade theme changes must invalidate the cached stylesheet");
const unoModule = readFileSync(join(root, "games/modules/uno/index.mjs"), "utf8");
assert.ok(unoClient.includes('import("./games/modules/uno/index.mjs")'), "UNO client must load its registered game module");
assert.ok(unoClient.includes("module.load(gameId)") && unoClient.includes("module.mount({matchId:gameId"), "UNO state loading and active match synchronization must use the module");
assert.ok(unoClient.includes('case "gather_uno_action": return module.action'), "UNO card actions must route through the module intent boundary");
assert.doesNotMatch(unoClient, /ctx\.db\.rpc\("gather_uno_(?:get_state|action|create|join|ready|start|leave|end|spectate)"/, "UNO client must not bypass the shared module for core lifecycle or private-state reads");
assert.ok(unoModule.includes("createLobbyService") && unoModule.includes("lobby.watch("), "UNO module must use shared lobby and match synchronization services");
assert.ok(unoModule.includes("loadPrivateState(matchId)") && unoModule.includes("hand: Object.freeze"), "UNO module must load and return only the viewer hand through the dedicated private-state RPC boundary");
assert.ok(serviceWorker.includes('"./games/modules/uno/index.mjs"'), "UNO module must be available in the offline static cache");

assert.ok(unoClient.includes("uno-seat-ring") && unoClient.includes("uno-direction-ring"), "UNO must render player seats and a direction indicator around the table");
assert.ok(unoClient.includes("selectedCardId") && unoClient.includes("uno-selection-preview"), "UNO must provide a selected-card preview");
assert.ok(unoClient.includes('addEventListener("drop"') && unoClient.includes("playSelected"), "UNO must support drag-and-drop and tap-to-discard interactions");
assert.ok(unoClient.includes("function showPlayerProfile") && unoClient.includes("function renderSettingsPanel"), "UNO must provide player profiles and personal appearance settings");
assert.ok(unoClient.includes("gather_uno_preferences") && unoClient.includes("auth.updateUser"), "UNO personal appearance preferences must sync through the signed-in account");
assert.ok(unoClient.includes("tableTheme") && unoClient.includes("cardBack"), "UNO personal settings must include table and card-back customization");
assert.ok(unoCss.includes('data-table-theme="violet"') && unoCss.includes('data-card-back="aurora"'), "UNO must provide the selectable table and card-back themes");
assert.ok(unoClient.includes('own.style.top="91%"') && unoClient.includes('String(pub.current_color||"wild").toUpperCase()') && !unoClient.includes('"COLOR · "'), "UNO player seat positioning and concise color labels must be maintained");
assert.ok(unoCss.includes(".uno-direction-ring:before{display:none}") && unoCss.includes(".uno-seat-turn{display:none}"), "UNO mobile table must remove overlapping decorative rings and redundant turn labels");
assert.ok(unoCss.includes("touch-action:pan-x") && unoCss.includes("margin-left:-8px"), "UNO mobile hand must remain swipeable with readable card spacing");
assert.ok(unoCss.includes("max-height:285px") && unoCss.includes("top:43%"), "UNO mobile playfield must stay bounded with clear center-pile spacing");
assert.ok(unoCss.includes("height:min(94dvh,1000px)") && unoCss.includes("flex:1 1 auto;flex-direction:column"), "UNO match must size its shell to the viewport and allocate remaining height through flex layout");
assert.ok(unoCss.includes("flex:1 1 0;min-width:0;min-height:clamp(210px,26vh,420px)") && unoCss.includes("height:clamp(112px,17vh,168px)"), "UNO table must expand into the space left after a reserved, responsive hand area");
assert.ok(unoCss.includes("orientation:landscape") && unoCss.includes("flex:0 1 38%"), "UNO match must provide a side-by-side table and hand layout on short landscape screens");

assert.match(retiredSnakeFunction, /status: 410/, "Retired Snake endpoint must return Gone");
assert.match(retiredGamesMigration, /REVOKE ALL PRIVILEGES ON FUNCTION/i, "Retired Tag/Snake RPCs must no longer be callable by client roles");
assert.match(retiredGamesMigration, /gather_tag_|gather_snake_/, "Retirement migration must cover both game RPC families");

assert.ok(ludoClient.includes("getLudoModule()).cancel(game.id)"), "Ludo host lobby cancellation must route through the shared module");
assert.match(ludoClient, /if \(isHost\(\)\) root\.append\(closeLobby\(\)\)/, "Ludo host must be able to close an active match lobby");
assert.match(ludoCloseMigration, /v_game\.created_by <> auth\.uid\(\)/, "Only the Ludo host may close the lobby");
assert.match(ludoCloseMigration, /status = 'cancelled'/, "Ludo cancellation must close the lobby for all members");
assert.ok(html.includes("ludo.js?v=20261114-shared-engine-1") && serviceWorker.includes("./ludo.js?v=20261114-shared-engine-1"), "Ludo shared-engine asset versions must match");
assert.ok(html.includes("ludo.css?v=20261114-neon-board-1") && serviceWorker.includes("./ludo.css?v=20261114-neon-board-1"), "Ludo neon board stylesheet versions must match");
assert.ok(ludoClient.includes('import("./games/modules/ludo/index.mjs")') && ludoClient.includes("module.load(gameId)") && ludoClient.includes("module.mount("), "Ludo reads and synchronizes active matches through its module");
assert.ok(ludoClient.includes("module.action(gameId, action") && ludoClient.includes("module.create("), "Ludo actions and lobby creation route through the module");
assert.doesNotMatch(ludoClient, /ctx\.db\.rpc\("gather_ludo_(?:create|join|ready|start|leave|cancel|decline|multiplayer_action)"/, "Ludo screen does not bypass its module");
assert.ok(ludoModule.includes("createLobbyService") && ludoModule.includes("lobby.watch("), "Ludo module uses shared lifecycle and Realtime services");
assert.ok(ludoModule.includes("drivers.byGame.ludo.action"), "Ludo uses its dedicated multiplayer action adapter");
assert.ok(serviceWorker.includes('"./games/modules/ludo/index.mjs"'), "Ludo module is cached offline");
assert.ok(ludoCss.includes("--ludo-neon-cyan:#42eaff") && ludoCss.includes("rgba(66,234,255,.78)"), "Ludo neon board styles are included");


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
