import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, client, games, app, html, worker] = await Promise.all([
  readFile(new URL("../supabase/migrations/20261114193000_add_dominoes_multiplayer.sql", import.meta.url), "utf8"),
  readFile(new URL("../dominoes.js", import.meta.url), "utf8"),
  readFile(new URL("../games.js", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../service-worker.js", import.meta.url), "utf8")
]);

test("Dominoes stores hands and boneyard in RLS-protected tables", () => {
  assert.match(migration, /create table if not exists public\.gather_dominoes_hands/i);
  assert.match(migration, /create table if not exists public\.gather_dominoes_boneyard/i);
  assert.match(migration, /alter table public\.gather_dominoes_hands enable row level security/i);
  assert.match(migration, /revoke all on public\.gather_dominoes_hands,public\.gather_dominoes_boneyard from public,anon,authenticated/i);
});

test("Dominoes only returns a private hand to its joined player", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.gather_dominoes_get_state");
  const end = migration.indexOf("$function$;", start) + "$function$;".length;
  const body = migration.slice(start, end);
  assert.match(body, /if v_player\.status='joined' then/i);
  assert.match(body, /where game_id=p_game_id and user_id=v_uid/i);
  assert.match(body, /'your_hand',coalesce\(v_hand,'\[\]'::jsonb\)/i);
});

test("Dominoes actions validate the turn and selected hand tile on the server", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.gather_dominoes_action");
  const end = migration.indexOf("$function$;", start) + "$function$;".length;
  const body = migration.slice(start, end);
  assert.match(body, /v_state->>'turn_user_id' <> v_uid::text/i);
  assert.match(body, /where d\.value->>'id'=p_tile_id/i);
  assert.match(body, /That tile does not match the left end/i);
  assert.match(body, /That tile does not match the right end/i);
});

test("Dominoes lobby enforces player counts and four seats for teams", () => {
  assert.match(migration, /Dominoes supports up to four players including the host/i);
  assert.match(migration, /Team mode needs exactly four players/i);
  assert.match(migration, /'starting_hand',7/i);
  assert.match(migration, /'target_score',v_target/i);
});

test("Dominoes keeps move and round history and includes preset variants", () => {
  assert.match(migration, /'round_history'/i);
  assert.match(migration, /'move_history'/i);
  assert.match(migration, /p_preset not in \('quick','classic','marathon'\)/i);
  assert.match(client, /Full match history/);
  assert.match(client, /Move history/);
});

test("Dominoes uses Gather's multiplayer launcher, lifecycle and notifications", () => {
  assert.match(games, /games-multiplayer-dominoes/);
  assert.match(games, /GatherDominoes\?\.open/);
  assert.match(app, /GatherDominoes\?\.init/);
  assert.match(app, /GatherDominoes\?\.shutdown/);
  assert.match(app, /dominoes_invite/);
  assert.match(app, /dominoes_spectate/);
  assert.match(html, /dominoes\.js/);
  assert.match(html, /dominoes\.css/);
  assert.match(worker, /dominoes\.js/);
  assert.match(worker, /dominoes\.css/);
});

test("Dominoes client supports tap selection, drag placement and reduced motion", () => {
  assert.match(client, /text\/domino-tile/);
  assert.match(client, /addDrop\(l,"left"\)/);
  assert.match(client, /addDrop\(r,"right"\)/);
  assert.match(client, /dominoes-reduced-motion/);
  assert.match(client, /dominoes-tutorial/);
});
