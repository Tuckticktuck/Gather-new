import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const partyClient = await readFile(new URL("../party.js", import.meta.url), "utf8");

test("Party Quick Play offers games according to their multiplayer seat limits", () => {
  assert.match(partyClient, /if \(count <= 10\) result\.push\("uno"\)/);
  assert.match(partyClient, /if \(count <= 4\) result\.push\("ludo", "dominoes"\)/);
  assert.match(partyClient, /const MULTIPLAYER = new Set\(\["uno", "ludo", "dominoes"\]\)/);
});

test("Party Quick Play creates a lobby for every joined party member", () => {
  assert.match(partyClient, /const members = \(party\.members \|\| \[\]\)\.filter\(member => member\.status === "joined"\)/);
  assert.match(partyClient, /p_max_players: members\.length/);
  assert.match(partyClient, /p_invited_user_ids: otherIds/);
  assert.match(partyClient, /verifyPartyLobbyRoster/);
});

test("Party Quick Play includes Dominoes and retains two-player classic games", () => {
  assert.match(partyClient, /dominoes: "Dominoes"/);
  assert.match(partyClient, /gather_dominoes_create/);
  assert.match(partyClient, /p_mode: "free_for_all"/);
  assert.match(partyClient, /if \(count === 2 && sharedChat\)/);
  assert.doesNotMatch(partyClient, /Gather Quick Play matches currently support exactly two players/);
});
