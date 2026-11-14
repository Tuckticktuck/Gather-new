# Gather Arcade Expansion — Implementation Plan

Status: Planning baseline (no game code or database schema changed by this document)
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

This is a planning inspection, not a full schema or policy audit. Before implementation, inspect the complete definitions, constraints, indexes, RLS policies, triggers, Realtime publication, and grants for the relevant objects.

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

Use Supabase Realtime as a notification/replication transport for canonical database changes, not as an authorization boundary. For high-frequency Snake movement, avoid writing every animation frame to Postgres. Use bounded input commands and server-authoritative simulation ticks or a carefully rate-limited state update model. Evaluate whether the current Supabase-only deployment can meet latency requirements before committing to a high-frequency architecture.

If a trusted persistent server loop is required for fair Snake simulation, identify and approve the hosting/runtime choice before implementation; GitHub Pages is static hosting and cannot run a game server. Do not silently add Netlify or Cloudflare. Prefer the current Supabase Edge Function / database capabilities only where their execution model fits the workload.

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

**Implementation files**
- New `snake-engine.ts`: deterministic rules, movement, collision, scoring, and unit-testable pure functions.
- New `snake.js`: lobby integration, input handling, rendering loop, interpolation, reconnect, and HUD.
- New `snake.css`: responsive arena and controls.
- Register scripts/styles in `index.html` and cache in `service-worker.js`.

**Integrity/performance requirements**
- Server owns authoritative tick, collision, collectible spawn, and result.
- Client sends direction/input changes, not claimed positions or score.
- Reject impossible direction reversals and excessive input rates.
- Interpolate between authoritative snapshots; do not make the UI depend on a database write every animation frame.
- Test latency, dropped packets, background-tab suspension, and reconnect.

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

### Phase 0 — Stabilize shared foundation (must pass before game work)
- Resolve or explicitly isolate the known client-submitted turn-based state validation weakness.
- Inspect and document existing multiplayer participant schema, Tag RPC security, game chat cleanup, and Realtime publication.
- Define one canonical lobby/match lifecycle contract.
- Add unit-test harness for pure game rules and deterministic fixtures.
- Add two-account E2E test setup and a documented test matrix.
- Confirm GitHub Actions checks can compile new TypeScript and validate all assets.

**Exit gate:** existing UNO, Ludo, Tag, and two-player games still create, invite, join, play, end, and rematch without regression.

### Phase 1 — Snake Arena
- Implement deterministic rules engine and tests.
- Implement server-authoritative movement/tick model and rate limits.
- Integrate lobby, invites, ready state, spectator access, chat, results, rematch.
- Implement desktop keyboard and mobile touch controls.
- Test reconnect, latency, collision boundaries, simultaneous inputs, and host departure.

**Exit gate:** two or more authenticated accounts complete repeated matches without divergent state or client-controlled scoring.

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

1. Inspect full definitions and access policies for `gather_multiplayer_games`, participant tables, Tag tables/RPCs, and game chat.
2. Write the canonical multiplayer lifecycle contract and state privacy model.
3. Decide whether Snake's authoritative tick can be implemented within the current Supabase-only runtime.
4. Add deterministic rules tests and two-account E2E infrastructure.
5. Implement Phase 0 before adding the three game modules.
