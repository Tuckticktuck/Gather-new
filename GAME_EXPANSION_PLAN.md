**Product status — 2026-11-14:** Live Tag Arena and Snake Arena are retired. Future Gather multiplayer additions should prioritize turn-based games that advance only on player actions and do not require a continuous simulation loop.

# Gather Arcade Expansion — Implementation Plan

Status: Phase 1 implementation, Supabase security/RPC review, deterministic CI, static validation, and GitHub Pages deployment pass; authenticated multi-account, reconnect, latency, and physical-device release verification remain outstanding
Repository: `Tuckticktuck/Gather-new`
Supabase project: `xrwldphmeafiakittcof`
Hosting: GitHub Pages
Scope: Complete multiplayer implementations of Snake Arena, Draw & Guess, and Word Hunt

## Product decision

Build an arcade-first expansion with three distinct play styles:

1. **Snake Arena** — real-time movement and collision-based arcade game.
2. **Draw & Guess** — real-time drawing, timed guessing, and round scoring.
3. **Word Hunt** — timed shared-letter-grid word search and competitive scoring.

All three use the existing Gather game hub, party/lobby conventions, invitation model, temporary game chat, theme system, and return-to-lobby flow. Do not create a parallel game hub or a separate invitation/chat product.

## Existing architecture inspected

### Repository

- `games.js` / `games.css`: current game hub, game catalog, invitations, game conversation history, launch UI.
- `tag.js`, `tag-engine.ts`, `tag.css`: existing real-time arena implementation and rendering patterns.
- `game-chat.js`: temporary game chat.
- `party.js` / `party.css`: party membership, invitations, and voting.
- `index.html`: static asset registration and script loading.
- `service-worker.js`: versioned offline shell cache.
- `AUDIT_REPORT.md`: recent application audit and known limitations.

### Live Supabase objects inspected

Existing tables include `gather_multiplayer_games`, `gather_games`, `gather_game_chat_messages`, `gather_game_parties`, and `gather_game_party_members`. The multiplayer game record already has `game_type`, `status`, `created_by`, `join_mode`, `settings`, `state`, `revision`, and timestamps. Existing RPC families include `gather_tag_*`, `gather_game_*`, and `gather_party_*`.

This was the planning inspection baseline. Subsequent Phase 0 work inspected the multiplayer create/join/leave/update helpers, RLS policies, Realtime publication, game chat cleanup trigger, function grants, and relevant private game state. Snake now uses the existing `gather_multiplayer_games` / `gather_multiplayer_players` tables plus a private per-player direction-input table; it does not use the generic full-state update RPC.

## Architecture decisions

### 1. Reuse the existing multiplayer game foundation

Use `gather_multiplayer_games` as the common match record if its current constraints and policies can safely support these game types. Use a new dedicated participant table only if the existing multiplayer participant model cannot support the required status, role, score, and reconnect semantics without breaking UNO/Ludo/Tag.

Do not overload `gather_games`: it is currently the two-player turn-based model with `player_one_id`, `player_two_id`, `turn_user_id`, and a board-like state. These arcade games require variable player counts and real-time/timed actions.

### 2. Authoritative server-side state transitions

Clients may render and predict presentation, but must not be trusted to submit arbitrary final game state or scores.

Every mutating RPC must:
- derive the caller from `auth.uid()`;
- verify match membership, role, and current status;
- validate action payload type, bounds, and size;
- enforce allowed phase/turn and server-side timing;
- apply the game-specific transition on the server;
- update the state with an atomic revision/compare-and-swap check;
- calculate scores and completion server-side;
- return the canonical new state/revision;
- reject stale, duplicate, unauthorized, or out-of-phase actions.

Do not use client clock values as authoritative deadlines. Do not expose secret words or unrevealed answer keys to every participant.

### 3. Shared lifecycle and UX

Reuse existing conventions:
- Non-fullscreen lobby and player/ready list.
- Host-controlled settings and start.
- Fullscreen gameplay with a top-right exit control where appropriate.
- Temporary game chat attached to the match.
- Reconnect/resume from canonical server state.
- End match, results screen, rematch, and return to the same lobby.
- Host may change settings only while the match is in a permitted lobby state.
- Preserve the current Messages/Games switcher and current game history/invitation surfaces.

### 4. Realtime strategy

Use Supabase Realtime as a notification/replication transport for canonical database changes, not as an authorization boundary. Snake uses a bounded tick model: browsers submit direction changes only; a JWT-verified Supabase Edge Function computes movement, collisions, food, scores, and results; a service-role-only database RPC commits the canonical snapshot under a row lock, revision/state compare-and-swap, and a database-clock tick interval. A client tick driver prompts the Edge Function (host-driven, with a stale-tick failover by another joined player). The browser never sends claimed positions or scores.

This is a server-authoritative, client-prompted tick MVP, not an always-running dedicated game server. It avoids per-frame Postgres writes, but still performs a database-backed transition per tick (currently 220–400 ms based on speed setting). This is suitable for an initial low-player-count, turn-tick arcade prototype, not a claim of high-scale low-latency real-time simulation. Performance, background-tab failover, reconnect, and multi-account consistency remain release checks. GitHub Pages is static hosting; do not silently add Netlify or Cloudflare. If the MVP's measured latency is not good enough, revisit a persistent trusted runtime as a separate approved architecture decision.

## Game specifications

### Snake Arena

**Initial rules**
- 2–8 players; one shared arena.
- Players steer with keyboard controls on desktop and touch joystick/swipe controls on mobile.
- Collectibles increase length/score.
- Arena boundaries, obstacles, and snake collisions follow one documented ruleset.
- Match ends by last player remaining or host-selected round timer; tie handling is explicit.
- Spectating is read-only.
- Reconnect restores position, score, alive/eliminated status, and remaining match time.

**Host settings**
- Arena size: small / standard / large.
- Round duration: default plus bounded custom values.
- Obstacles: off / standard.
- Speed preset: slow / standard / fast.
- Player cap: 2–8.

**Implementation files (first playable slice committed)**
- `supabase/functions/gather-snake-action/snake-engine.mjs`: deterministic authoritative movement, collision, food spawn, scoring, timer and winner rules.
- `supabase/functions/gather-snake-action/index.ts`: JWT-verified direction and tick endpoint.
- `snake.js`: lobby/invitation UI, ready/start/settings, fullscreen Canvas view, keyboard/touch controls, realtime refresh, host tick driver with failover, recap/rematch, and temporary game chat.
- `snake.css`: responsive lobby and fullscreen arena styles.
- `supabase/migrations/20261114022328_snake_arena_authoritative_multiplayer_foundation.sql` plus lifecycle and invitation migrations: private inputs, game-specific RPCs, and secure friend open-lobby discovery.
- `tests/snake-engine.test.mjs`: deterministic rules tests.
- Registered in `index.html`, `app.js`, `games.js`, `party.js`, and `service-worker.js`.

**Integrity/performance status**
- The Edge Function owns the rules calculation for tick, collision, collectible spawn, score, and result.
- Client sends direction input only; private input rows are not readable by authenticated clients.
- Impossible reversal and extra direction changes during the same tick are rejected.
- A service-role-only compare-and-swap RPC commits the computed state and checks the server tick interval.
- The current Canvas renders canonical snapshots; interpolation/smoothing is still a follow-up before higher-speed play.
- Automated engine tests cover due ticks, direction changes, food growth, wall/obstacle/self/player collisions, head-on swaps, timeout, and completed-state immutability. Real-device latency, dropped packets, background-tab suspension, reconnect, and two-account match completion remain unverified.

### Draw & Guess

**Initial rules**
- 2–12 players; solo scoring first, with optional teams after core mode is stable.
- One drawer per turn receives a secret word.
- Other players submit guesses through a dedicated guess UI.
- Correct guesses score according to server-calculated time/round rules.
- Drawer receives points based on participation/correct guesses.
- Rotate drawer fairly; prevent a player from drawing twice before others have had a turn where practical.
- Configurable rounds and drawing duration.
- Spectators cannot submit guesses or drawing strokes.

**Host settings**
- Round count: 3 / 5 / 8.
- Drawing time: 45 / 60 / 90 seconds.
- Word difficulty: easy / mixed / challenging.
- Team mode: off initially; enable after individual mode passes E2E tests.

**Implementation files**
- New `draw-guess.js`: round UI, drawing canvas, input capture, guesses, score display, reconnect.
- New `draw-guess.css`: canvas, palette, mobile drawing toolbar, round HUD.
- Shared drawing protocol helpers may be placed in `games/shared/drawing.js` if they are genuinely reusable.

**Integrity/privacy requirements**
- Store the secret word in server-private state or a protected table/RPC response that only the drawer can read.
- Never include the answer in the public Realtime row/payload.
- Validate that only the current drawer can submit strokes and only guessers can submit guesses.
- Sanitize/limit guess text; rate-limit guesses and drawing events.
- Server controls timer, round rotation, correct-guess detection, and scores.
- Use bounded stroke batches and throttle persistence; do not persist every pointer event individually.

### Word Hunt

**Initial rules**
- 2–8 players; everyone receives the same generated letter grid.
- Players trace adjacent letters to submit words.
- A word may be scored only once per player; duplicate words across players are handled by the chosen scoring rules.
- Server validates dictionary membership, adjacency, minimum length, and duplicate rules.
- Fixed round timer; scores are calculated after the round.
- Reconnect restores the active grid, submissions, and remaining server time.

**Host settings**
- Grid: 4×4 default; optional 5×5.
- Round duration: 60 / 90 / 120 seconds.
- Minimum word length: 3 or 4.
- Scoring: length-based default.

**Implementation files**
- New `word-hunt.js`: grid interaction, touch/mouse path selection, submitted-word list, timer, results.
- New `word-hunt.css`: responsive grid and accessible touch targets.
- Dictionary validation must run in trusted server-side code or a database-owned validated word set; client-side dictionary checks are only hints.

**Integrity requirements**
- Generate and persist the grid server-side using a documented, reproducible rule set.
- Validate each submitted path against grid adjacency and letter sequence.
- Enforce dictionary and duplicate rules server-side.
- Do not accept client-submitted scores or timer values.

## Shared Supabase data/API plan

First inspect whether the current multiplayer player table and RPCs can support all three games. If reusable, extend them with narrow, game-specific RPCs rather than building a second generic framework.

Expected RPC responsibilities (names are proposed, not existing objects):

| RPC responsibility | Snake | Draw & Guess | Word Hunt |
|---|---|---|---|
| Create lobby / invite | shared existing lifecycle if compatible | shared | shared |
| Join / leave / ready | shared | shared | shared |
| Start match | host only | host only | host only |
| Submit action | direction input | stroke batch / guess | word path |
| Advance round/tick | trusted simulation | server timer / next drawer | server timer |
| End match / rematch | validated result | validated result | validated result |

Potential new database fields/tables should be chosen only after inspecting existing participant records and policies. Likely requirements include participant role/status, ready state, score, last-seen/reconnect metadata, and private per-player state. Avoid storing secret words or hidden information in publicly selectable JSONB.

For each migration:
1. Recover and compare the relevant live definitions first; the repository currently has a documented migration-source reconciliation gap.
2. Create a new migration with the Supabase CLI migration workflow; do not invent timestamps or replay missing historical migrations.
3. Apply additive schema/functions/policies with explicit grants and RLS.
4. Test as anonymous, authenticated non-member, invited member, joined player, spectator, and host.
5. Run Supabase security/performance/health advisors and inspect function grants/search paths.
6. Verify live schema and RPC behavior after deployment.

## Frontend integration plan

1. Add catalog entries for `snake_arena`, `draw_guess`, and `word_hunt` to the existing `TYPES` catalog in `games.js`.
2. Add the three options to the appropriate new-game chooser and lobby settings UI. Do not route them through the current two-player-only `gather_game_create` flow.
3. Extend the existing multiplayer lobby/party launch path so invites, accepted players, spectators, and party Quick Play all resolve to one match record.
4. Add one small game module per title; each module owns its rendering and game-specific controls but calls shared lifecycle functions.
5. Reuse temporary game chat and game conversation history where current IDs/types can represent the new match safely.
6. Add CSS and script references to `index.html`.
7. Update the service-worker cache name and shell URLs in `service-worker.js` whenever asset query versions change. Verify every local asset reference resolves.
8. Preserve GitHub Pages relative paths and avoid server-only imports in browser bundles.

## Delivery phases and acceptance gates

### Phase 0 — Stabilize shared foundation
- [x] Isolate the legacy two-player board-game state integrity weakness with per-game server validators and intent-based client actions.
- [x] Inspect and document existing multiplayer participant schema, Tag action limits, game chat cleanup, Realtime publication, and helper functions.
- [x] Define the multiplayer lifecycle contract and action privacy rules.
- [x] Add deterministic Node test harness and shared contract tests.
- [x] Add a documented two-account E2E matrix (the actual authenticated browser run is still pending).
- [x] Confirm GitHub Actions compiles TypeScript and validates scripts, assets, CSS structure and service-worker cache.

**Exit gate status:** code-level compatibility and automated regression checks pass. A real two-account regression of UNO, Ludo, Tag, and the board games is still pending.

### Phase 1 — Snake Arena

**Implementation status:** The first playable slice is implemented, including read-only spectator admission, pre-start spectator-to-player conversion when a seat is free, and foreground/network/Realtime resume refresh. Supabase schema/RPC review, deployed Edge Function verification, deterministic tests, static validation, and GitHub Pages deployment pass. The authenticated multiplayer and device acceptance gate is still open.

- [x] Deterministic rules engine and automated tests (28 current deterministic tests across Snake and shared/board-game contracts).
- [x] JWT-verified Supabase Edge Function accepts player direction intent and performs server-calculated ticks; tick commits use a row lock and revision/state compare-and-swap.
- [x] Shared multiplayer lobby, invite-only/open join, ready checks, host settings, bounded player count, invitation decline, leave/end, recap, and rematch.
- [x] Read-only spectator access for invitees and accepted friends in open lobbies, including full lobbies; spectators do not consume player slots and cannot move, drive ticks, use temporary game chat, or use host controls.
- [x] Spectators can leave, see spectated matches in the Snake panel and live-game notification surface, and are excluded from player readiness/counts.
- [x] A spectator can convert to a player before the lobby starts when capacity is available; server-side join rules still enforce invitations/friend status and capacity.
- [x] Friend-scoped open-lobby discovery without weakening participant-table RLS.
- [x] Fullscreen arena, keyboard/WASD/touch directional controls, scoreboard, temporary game chat for joined players, result panel, and rematch.
- [x] Game Hub, central game notifications, and Party Quick Play integration.
- [x] Regression assertions for UNO recap rendering, done confirmation, rematch request, accept/decline handlers, and completed-lobby return.
- [x] Added the user_id foreign-key index for private.gather_snake_inputs; the migration is applied in Supabase and its source is committed as 20261114130744_index_snake_input_user_references.sql.
- [x] Snake refreshes canonical state when a tab becomes visible, the browser returns online, or Supabase Realtime resubscribes; lifecycle listeners are removed on shutdown.
- [x] Invalidated the service-worker cache (gather-shell-v83), changed the Snake script URL version, and added a regression assertion so clients receive the reconnect fix.
- [x] Confirmed deployed gather-snake-action (version 1) and gather-board-game-action (version 2) are ACTIVE, require JWT verification, and match their committed source files byte-for-byte.
- [x] Confirmed the Snake tick/input/snapshot and board-game commit RPCs are service_role-only; client-facing game RPCs are authenticated-only (not anonymous). Snake input, UNO private state, and UNO rematch-offer tables deny direct client SELECT; the rematch-offer table has RLS enabled and no client policies.
- [x] Confirmed UNO rematch-offer data is accessed through the joined-player-authorized rematch RPC flow rather than direct table access.
- [x] Preserved finished UNO recap state when a participant leaves; pending rematch offers involving that participant are cancelled and participants notified.
- [x] UNO rematch responses use a consistent game-before-offer lock order and verify all original players are still joined before starting a fresh deal.
- [x] Applied and committed migration 20261114133052_preserve_uno_recap_when_player_leaves.sql; static CI assertions cover finished-recap preservation, pending-offer cancellation, participant revalidation, and lock ordering.

**CI and deployment verification (2026-11-14):** The main workflow now type-checks both Phase 1 Supabase Edge Functions with Deno, compiles the Tag TypeScript engine, runs the deterministic Node test suite (including the new Snake simultaneous-tail-collision regressions), syntax-checks every JavaScript file, validates the HTML/CSS/assets/service-worker cache, and deploys the static site to GitHub Pages. Static validation currently checks 429 unique HTML IDs, 20 local assets, and 7 CSS files. Use the [Gather Pages workflow history](https://github.com/Tuckticktuck/Gather-new/actions/workflows/pages.yml) as the live source for the latest tested commit and deployment result; older run links are historical evidence only.

**Remaining release gates (not simulated or claimed as passed):** tests/e2e/README.md and tests/e2e/PHASE_1_SNAKE_RELEASE.md are test plans/checklists, not an executable authenticated browser suite. No dedicated E2E test users, disposable test project, or browser automation runner are provisioned in this repository. The live project must not be used for destructive multi-account lifecycle tests.
- [ ] Run the Phase 1 E2E checklist using two player accounts and a third observer account, in a dedicated test environment.
- [ ] Verify complete create/invite/join/ready/start/play/finish/leave/rematch cycles, including host departure, capacity, invitation decline, spectator restrictions, stale revisions, duplicate actions, and chat cleanup.
- [ ] Re-run the UNO recap test with two signed-in players: both see I am done and Request rematch; confirm done/decline/accept flows, player-leave-during-recap cancellation, and ensure no duplicate lobby or stale recap.
- [ ] Regression-test existing UNO, Ludo, Tag, Battleship, Chess, Checkers, Tic-Tac-Toe, and Connect Four flows after shared RPC/client changes.
- [ ] Test reconnect, simultaneous inputs, latency, dropped requests, background-tab suspension, and host tick-driver handoff.
- [ ] Validate iPhone Safari, Chromebook Chrome, and desktop layouts/accessibility; check touch controls, keyboard controls, fullscreen exit, safe-area spacing, and no clipping.
- [ ] Decide whether the current client-prompted Edge Function tick cadence is adequate based on measured results; replace it only if the measured latency/background-tab behavior requires a persistent trusted simulation runtime.

**Runtime limitation:** the game rules, tick timing, collision handling, and score calculation are server-authoritative inside the Edge Function, but the next tick is prompted by a joined player's browser. This is a first playable server-authoritative design, not a continuously running dedicated simulation process. Real multi-device latency/failover measurements are required before calling it production-hardened.

**Current Supabase advisory note (2026-11-14):** the Phase 1-specific unindexed foreign-key warning was fixed. The security advisor reports 63 public SECURITY DEFINER functions; 56 are executable by authenticated users, none are executable by anon, and all 56 authenticated-callable functions use an empty search path and contain an `auth.uid()` check. These are intentional signed-in RPC entry points, so no blanket revokes were applied. The advisor also reports 11 RLS-enabled tables without policies; the private Snake input, UNO private-state, UNO rematch-offer, and age-record tables were checked and have no direct anon/authenticated SELECT or INSERT privileges. The performance advisor reports 23 unused-index notices (informational), and the health advisor reports no findings. Auth leaked-password protection remains disabled in the project Auth settings and is separate from the Phase 1 game work.

**Exit gate:** two or more authenticated players complete repeated matches without divergent canonical state or client-controlled scoring, with a separate observer proving read-only access and the required device/reconnect checks passing. CI and static inspection alone do not satisfy this gate.

### Phase 2 — Draw & Guess
- Implement private drawer word assignment and public round state.
- Implement canvas strokes, throttled transport, guesses, timer, scoring, drawer rotation.
- Integrate lobby, spectator mode, chat, results, rematch.
- Test hidden-word privacy with a non-drawer account and direct database/API access.

**Exit gate:** a full multi-round match works across at least three accounts; non-drawers cannot retrieve the answer before reveal.

### Phase 3 — Word Hunt
- Implement server grid generation, path selection, dictionary validation, timer, scoring.
- Integrate lobby, reconnect, chat, results, rematch.
- Test invalid adjacency, invalid words, duplicates, race conditions, and expiry.

**Exit gate:** all scores are reproducible from accepted server-validated submissions.

### Phase 4 — Release hardening
- Test iPhone Safari, Chromebook Chrome, and desktop layouts.
- Test slow connections, reconnects, background tabs, and simultaneous joins.
- Run full existing-game regression suite.
- Run Supabase advisors and verify RLS/grants.
- Update service-worker cache and GitHub Pages deployment.
- Confirm deployment SHA and perform real multi-account smoke tests.

## Required automated tests

### Shared
- Unauthorized/non-member actions rejected.
- Spectators cannot mutate game state.
- Host-only settings/start/end permissions enforced.
- Stale revision and duplicate action rejected safely.
- Reconnect returns canonical state.
- Ending a match cleans up temporary game chat through the existing trusted cleanup path.
- Duplicate lobby creation is prevented.
- Rematch creates a clean state and does not reuse stale scores/timers.

### Snake Arena
- Direction reversal, wall collision, self collision, player collision, collectible spawn, elimination, tie, timeout, and simultaneous input ordering.

### Draw & Guess
- Only drawer can draw; only guessers can guess; secret word remains private; duplicate correct guesses do not score twice; timer expiration rotates drawer exactly once.

### Word Hunt
- Valid adjacency; invalid non-adjacent path; path-to-word matching; dictionary rejection; duplicate handling; timer cutoff; server-calculated scoring.

## Risks and explicit non-goals

- **Realtime performance:** Supabase database change events are not a substitute for a low-latency authoritative game loop. Snake may require a trusted persistent runtime; assess before choosing implementation.
- **Migration drift:** the current snapshot has 154 applied migration records, 117 repository migration files, 111 same-name matches, 43 applied names without matching source files, and 6 repository files without a same-name applied record. Do not rewrite migration history or replay guessed SQL.
- **Turn-based integrity:** direct authenticated execution of the generic `gather_game_move` and board commit RPCs is revoked. Chess, Checkers, Tic-Tac-Toe, and Connect Four transitions are recalculated by the JWT-verified `gather-board-game-action` Edge Function; Ludo and Battleship use their dedicated validated paths. Keep the regression gate open until real signed-in game sessions pass.
- **Browser test gap:** the previous audit did not include authenticated multi-account browser testing or device visual regression. These are release gates, not assumed successes.
- Do not add Netlify or Cloudflare.
- Do not redesign the existing Messages/Games switcher or replace current lobby/chat systems as part of this work.
- Do not ship a game with client-authoritative score, timer, winner, or final state.

## Immediate next engineering tasks

1. Run authenticated two-account and multi-account smoke tests for UNO recap actions and Snake Arena lobby/match/rematch flows.
2. Validate Snake Arena on iPhone Safari, Chromebook Chrome, and desktop; measure tick latency and background-tab failover.
3. Tune Canvas interpolation and the client-prompted tick cadence if the real tests show visible stepping or stutter.
4. Complete existing-game regression for UNO, Ludo, Tag, Battleship, Chess, Checkers, Tic-Tac-Toe, and Connect Four.
5. Proceed to Phase 2 — Draw & Guess — after the Snake release gate is met.
