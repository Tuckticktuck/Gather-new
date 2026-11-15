import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gamesClient = await readFile(new URL("../games.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261115151000_add_friend_open_game_lobby_directory.sql", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");

test("Games homepage catalog contains every supported game and its player range", () => {
  for (const game of ["Chess", "Checkers", "Tic-Tac-Toe", "Connect Four", "Battleship", "UNO", "Ludo", "Dominoes"]) {
    assert.ok(gamesClient.includes('name: "' + game + '"'), game + " must appear in the homepage catalog");
  }
  assert.match(gamesClient, /2–10 players/);
  assert.match(gamesClient, /2–4 players/);
});

test("Game browser separates conversation matches from friend open lobbies", () => {
  assert.match(gamesClient, /gather_public_game_lobbies/);
  assert.match(gamesClient, /conversationIds\.has\(game\.conversation_id\)/);
  assert.match(gamesClient, /gather_public_lobby_action/);
  assert.match(gamesClient, /button\("Spectate"/);
  assert.match(gamesClient, /button\(game\.viewer_status === "spectating" \? "Join as player" : "Join lobby"/);
});

test("Open lobby RPC exposes only safe friend-visible lobbies to authenticated users", () => {
  assert.match(migration, /g\.join_mode='open'/);
  assert.match(migration, /public\.friendships/);
  assert.match(migration, /private\.is_blocked_between/);
  assert.match(migration, /revoke all on function public\.gather_public_game_lobbies\(text\) from public,anon/i);
  assert.match(migration, /grant execute on function public\.gather_public_game_lobbies\(text\) to authenticated/i);
});

test("Open lobby actions use authoritative game lifecycle RPCs", () => {
  assert.match(migration, /public\.gather_uno_join/);
  assert.match(migration, /public\.gather_ludo_join/);
  assert.match(migration, /public\.gather_dominoes_join/);
  assert.match(migration, /public\.gather_uno_spectate/);
  assert.match(migration, /public\.gather_dominoes_spectate/);
  assert.match(migration, /status='spectating'/);
});

test("Game browser assets are versioned consistently in the page and offline shell", () => {
  assert.match(html, /games\.js\?v=20261115-game-browser-1/);
  assert.match(html, /games\.css\?v=20261115-game-browser-1/);
  assert.match(serviceWorker, /games\.js\?v=20261115-game-browser-1/);
  assert.match(serviceWorker, /games\.css\?v=20261115-game-browser-1/);
  assert.match(serviceWorker, /gather-shell-v124/);
});
