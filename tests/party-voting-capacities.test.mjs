import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261115145849_party_poll_multiplayer_capacity_rules.sql", import.meta.url), "utf8");

test("party voting includes Dominoes in the game allowlist", () => {
  assert.match(migration, /'chess','checkers','tic_tac_toe','connect_four','battleship','uno','ludo','dominoes','tag'/);
});

test("party voting applies supported capacity limits", () => {
  assert.match(migration, /v_party_size > 4 and 'ludo'=any\(v_options\)/);
  assert.match(migration, /v_party_size > 4 and 'dominoes'=any\(v_options\)/);
  assert.match(migration, /v_party_size > 10 and 'uno'=any\(v_options\)/);
});

test("party voting remains authenticated and leader-only", () => {
  assert.match(migration, /if v_uid is null/);
  assert.match(migration, /m.role='leader' and m.status='joined'/);
  assert.match(migration, /SECURITY DEFINER/i);
  assert.match(migration, /set search_path = ''/i);
});
