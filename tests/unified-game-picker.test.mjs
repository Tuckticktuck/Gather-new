import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [games, css] = await Promise.all([
  readFile(new URL("../games.js", import.meta.url), "utf8"),
  readFile(new URL("../games.css", import.meta.url), "utf8")
]);

const expectedGames = [
  "chess",
  "checkers",
  "tic_tac_toe",
  "connect_four",
  "battleship",
  "uno",
  "ludo",
  "dominoes"
];

test("New Game presents every supported game in one shared catalog", () => {
  const listedGames = [...games.matchAll(/data-game-type="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(listedGames, expectedGames);
  assert.doesNotMatch(games, /games-choose-two-player|games-choose-multiplayer|games-multiplayer-chooser/);
});

test("Selecting a game automatically opens the matching player-count setup", () => {
  assert.match(games, /function openCreateModal\(defaultConversationId, gameType = "chess"\)/);
  assert.match(games, /openCreateModal\(undefined, gameType\)/);
  assert.match(games, /const choice = event\.target\.closest\("\[data-game-type\]"\)/);
  assert.match(games, /openCreateModal\(undefined, gameType\)/);
  assert.match(games, /function renderGameSetupSettings\(gameType\)/);
  assert.match(games, /id = "games-player-limit"/);
  assert.match(games, /gameType === "uno" \? 10 : 4/);
  assert.match(games, /id = "games-join-mode"/);
  assert.match(games, /joinMode,\s+invitedUserIds: openLobby \? \[\] : inviteeIds/);
});

test("Unified game catalog uses a responsive, scrollable card grid", () => {
  assert.match(css, /\.games-type-chooser-options\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.games-type-chooser-modal[^\n]*max-height/);
  assert.match(css, /@media\(max-width:520px\)/);
});


test("Conversation Play a game opens the game chooser and keeps the originating conversation", () => {
  assert.match(games, /if \(activeChat\?\.id\) openGameTypeChooser\(activeChat\.id\)/);
  assert.match(games, /function openGameTypeChooser\(conversationId = null\)/);
  assert.match(games, /const conversationId = gameTypeChooserConversationId/);
  assert.match(games, /closeGameTypeChooser\(\);/);
  assert.match(games, /openCreateModal\(conversationId, gameType\)/);
  assert.match(games, /select\.disabled = !!defaultConversationId/);
  assert.match(games, /This conversation is no longer available for starting a game/);
});
