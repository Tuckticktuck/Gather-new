# Gather Arcade Expansion — Implementation Plan

Status: Phase 1 implementation and automated release checks pass; authenticated multi-account, reconnect, latency, and device verification remain outstanding
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
<text>**Implementation status: first playable slice implemented, including read-only spectating; automated release checks and GitHub Pages deployment passed on 2026-11-14. Authenticated release verification remains outstanding.**</text>
- [x] Deterministic rules engine and automated tests.
- [x] Server-authoritative direction/tick endpoint, server timing, row lock and revision/state compare-and-swap.
- [x] Shared multiplayer lobby, invites, ready state, host settings, max-player validation, leave/end, recap and rematch.
- [x] Read-only spectator access for invited users and accepted friends in open lobbies; spectators do not consume player slots or receive movement, host, or game-chat controls.
- [x] Friend-scoped open lobby discovery without weakening participant table RLS.
- [x] Fullscreen arena, keyboard/touch directional controls, temporary game chat, result panel.
- [x] Integrate Game Hub, central game notifications and Party Quick Play.
- [x] Add regression assertions for UNO recap rendering, done confirmation, rematch creation, and accept/decline response handlers.

**Latest automated verification before spectator work (2026-11-14):** GitHub Actions run [43595885507](https://github.com/Tuckticktuck/Gather-new/actions/runs/43595885507) passed the TypeScript build, all 28 deterministic tests, JavaScript syntax validation, site asset/HTML/CSS/service-worker validation, and the deployment job. The separate Pages deployment workflow also passed. The spectator change is being re-run through CI before its own release status is recorded. Supabase reports `gather-snake-action` active with JWT verification enabled; the Snake input, tick snapshot, and tick commit RPCs are service-role-only. UNO recap RPCs are present and require joined-player authorization. Private Snake and UNO state tables deny direct SELECT to `anon` and `authenticated`.

**Release verification limitation:** `tests/e2e/README.md` is still a test plan, not an executable authenticated browser suite. The repository has no dedicated test users, test credentials, disposable E2E project, or browser automation environment. Do not run destructive lifecycle tests against the live user project or mark the multiplayer release gate complete without those prerequisites.
- [ ] Verify two-to-eight accounts through complete create/invite/join/ready/start/play/end/rematch cycles.
- [ ] Test reconnect, latency, dropped packets, background-tab suspension, host departure, and mobile/Chromebook visual layout.
- [ ] Tune or replace the client-prompted tick driver based on observed latency.

**Exit gate:** two or more authenticated accounts complete repeated matches without divergent state or client-controlled scoring; the current automated tests alone do not satisfy this gate.

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
- **Migration drift:** 43 applied migration names were missing matching source files in the last audit snapshot. Do not rewrite migration history or replay guessed SQL.
- **Current turn-based integrity gap:** the existing `gather_game_move` limitation remains relevant to the shared game platform; the previous audit documents it.
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
