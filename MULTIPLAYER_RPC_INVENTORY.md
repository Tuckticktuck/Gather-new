**Product status — 2026-11-14:** Tag and Snake entries below are historical only. The app no longer loads their clients, and client execution of their public RPCs is revoked. The Snake Edge Function responds HTTP 410. Database history is preserved rather than dropping tables or replaying old migrations.

# Gather Multiplayer RPC and Client-Caller Inventory

Status: Phase 0 compatibility mapping, 2026-11-14
Scope: source-level caller mapping plus live database function/privilege inspection. This is an inventory, not a claim that all flows have been E2E-tested.

## Architecture split

Gather currently has three distinct game persistence/action families. They must not be merged casually.

1. **Legacy two-player turn-based:** `public.gather_games`, used by Chess, Checkers, Tic-Tac-Toe, Connect Four, Battleship, and the legacy two-player Ludo code path.
2. **Shared multiplayer lobby model:** `public.gather_multiplayer_games` and `public.gather_multiplayer_players`, used by UNO, standalone/multiplayer Ludo, and other shared lobby infrastructure.
3. **Dedicated Tag lobby model:** `public.gather_tag_lobbies` and `public.gather_tag_players`, with Tag-specific movement and round RPCs.

Do not treat a same-named game in two families as the same runtime. In particular, legacy Ludo and multiplayer Ludo have different state models and RPCs.

## Client source call map

| Client module | Game / concern | RPCs or direct data access | Persistence family |
|---|---|---|---|
| `games.js` | Hub and invites | Reads `gather_games`; reads multiplayer/tag invitation and roster rows | All three |
| `games.js` | Chess | `gather_game_create`, `gather_game_accept`, `gather-board-game-action` Edge Function, `gather_game_end` | Legacy turn-based + server validator |
| `games.js` | Checkers | `gather_game_create`, `gather_game_accept`, `gather-board-game-action` Edge Function, `gather_game_end` | Legacy turn-based + server validator |
| `games.js` | Tic-Tac-Toe | `gather_game_create`, `gather_game_accept`, `gather-board-game-action` Edge Function, `gather_game_end` | Legacy turn-based + server validator |
| `games.js` | Connect Four | `gather_game_create`, `gather_game_accept`, `gather-board-game-action` Edge Function, `gather_game_end` | Legacy turn-based + server validator |
| `games.js` | Battleship | `gather_game_create`, `gather_game_battleship_private_state`, `gather_game_battleship_action` | Legacy game row + private fleet table |
| `games.js` | Legacy Ludo | `gather_game_create`, `gather_ludo_action` | Legacy turn-based |
| `games.js` | Legacy Ludo (alternate multiplayer module) | Client code contains `gather_ludo_multiplayer_action` path in multiplayer module; verify which UI path is mounted before changing | Shared multiplayer |
| `uno.js` | UNO lobby and match | `gather_uno_create/join/ready/start/get_state/action/leave/end/decline/done/request_rematch/respond_rematch`; reads shared game/player rows; Realtime subscriptions | Shared multiplayer + private UNO state |
| `ludo.js` | Standalone multiplayer Ludo | `gather_ludo_create/join/ready/start/multiplayer_action/leave/cancel/decline`; reads shared game/player rows; Realtime subscriptions | Shared multiplayer |
| `snake.js` | Snake Arena | `gather_snake_create/join/decline/ready/set_settings/start/leave/end/rematch/spectate`; `gather-snake-action` Edge Function for direction input and authoritative tick | Shared multiplayer + private input table |
| `tag.js` | Tag lobby and round | `gather_tag_create/join/ready/set_mode/customize/start_round/return_lobby/leave/decline/finish_expired/move`; reads Tag lobby/player rows; Realtime subscriptions | Dedicated Tag |
| `game-chat.js` | Temporary in-game chat | `gather_game_chat_list`, `gather_game_chat_send` | Shared chat table + per-family authorization |
| `party.js` / `game-people-picker.js` | Party and invitation selection | Party-specific RPC/table access; must retain existing membership and eligibility checks | Party + invitation layer |

## Action authority and state ownership

### Legacy two-player games

- Chess, Checkers, Tic-Tac-Toe, and Connect Four now send a **move intent** to the authenticated `gather-board-game-action` Edge Function; clients no longer submit a replacement board, turn, result, or winner.
- The function verifies the caller's Supabase session, checks that the actor is one of the two players and owns the current turn, validates the move against the stored match, derives the next board/result server-side, and commits through `gather_board_game_commit_move`.
- Chess replays the stored SAN history with `chess.js`, confirms it produces the stored FEN, applies one legal move, and derives mate/draw/next turn on the server.
- Checkers validates legal diagonal movement, mandatory capture, promotion, multi-jump continuation, and win/no-legal-move outcomes.
- Tic-Tac-Toe validates mark counts, current mark, empty-square placement, win, and draw. Connect Four validates board shape, tokens, gravity, current color, column capacity, win, and draw.
- The commit RPC locks the match row and compares both the expected revision and original state to the state the Edge Function validated. It checks the conversation's current messaging permissions again before writing.
- Execute on `gather_board_game_commit_move` is restricted to `service_role`; the former generic `gather_game_move` full-state endpoint has had execute revoked from `public`, `anon`, and `authenticated`.
- Deterministic unit coverage is in `tests/board-game-rules.test.mjs`; CI runs it with the shared multiplayer contract tests. Full two-account browser/E2E verification remains a separate release gate.

### Battleship

- Client submits intent (`place_fleet` or `fire`) and payload to `gather_game_battleship_action`.
- Live RPC validates fleet count, lengths, contiguous geometry, overlap, board bounds, turn, and shot target; fleet data is stored separately in `gather_battleship_fleets`.
- `gather_game_battleship_private_state` returns only the caller's fleet state for a player; non-player conversation members receive a non-player response.
- This is the strongest existing example of intent-based, server-computed game transitions in the legacy family.

### Legacy Ludo

- Client submits `roll`, `move`, or `end` with a token index to `gather_ludo_action`.
- Live RPC rolls dice on the server and computes token movement, captures, turn order, and winner.
- It locks the game row and verifies player identity and turn.
- Keep separate from multiplayer Ludo.

### Multiplayer Ludo

- Client submits `roll`, `move`, or `end` with token index to `gather_ludo_multiplayer_action`.
- Live RPC checks joined membership, match state, current turn, validates token movement, computes captures and winner, and updates canonical shared state under a row lock.
- Dice roll is server-generated. Host-only end is enforced.
- This is a suitable intent/action pattern to study for future turn-based multiplayer games, subject to additional test coverage.

### UNO

- Client submits intent actions (`play`, `draw`, `pass`, `call_uno`) and card ID / chosen color to `gather_uno_action`.
- Live RPC locks and reads private state, verifies caller/turn/card ownership/legality, computes effects, advances state, and updates public card counts.
- Private hands/deck live in `private.gather_uno_private_states`; shared public row does not expose card hands.
- This is a strong example of separating public match state from private game state.

### Tag

- Client submits desired position to `gather_tag_move`; client-side `tag-engine.ts` handles presentation/simulation support.
- Public wrapper delegates to `private.gather_tag_move`. Live helper verifies authenticated joined player, active lobby, conversation permissions, bounds, and a maximum per-request displacement of 9 arena units; it serializes on the moving player's row and resolves tagging/collision modes. It does not enforce elapsed-time movement speed or run a trusted continuous simulation/tick. Therefore it is not a server-authoritative movement simulation and must not be reused for Snake.
- Tag's dedicated lobby schema and RPCs are not interchangeable with the generic multiplayer lifecycle. The live Tag helper set includes create, customize, start, join, ready, set_mode, leave, end/return, finish_expired, and move. The lobby host controls mode/start/return; ready is per joined player. The Tag movement helper does not itself check the round deadline on every movement; expiry is handled through a separate finish-expired RPC path.
- A client-submitted position is not a server-authoritative continuous simulation; do not copy this pattern for a competitive Snake simulation.

## RPC exposure baseline

Live inspection shows the relevant public RPCs are executable by `authenticated` and not by `anon`. Most game action functions are `SECURITY DEFINER`; the shared generic multiplayer wrappers are generally invoker functions that delegate into private helpers. This inventory does not itself establish that each function is safe: inspect each function body, its private helper, search_path, caller checks, and grants before modifying it.

## Compatibility requirements for Phase 0

- Preserve the separate legacy turn-based, shared multiplayer, and Tag persistence families.
- New games must use a shared lobby/player lifecycle only after an appropriate server-authoritative action/private-state layer exists.
- New game RPCs accept intent, not a client-authored resulting state, score, winner, clock, or hidden information.
- Use row locks or compare-and-swap revisions for concurrent state transitions.
- Keep private state outside shared rows readable by invitees under current RLS.
- Keep the existing temporary game chat cleanup trigger and game-chat authorization semantics.
- Existing UNO, both Ludo paths, Tag, Battleship, and the four legacy turn-based games require regression coverage.

## Remaining verification before Phase 0 completion

- [ ] Map and test every host/participant/invitee/spectator path with two authenticated accounts.
- [ ] Inspect the full private Tag movement implementation and all Tag SQL helper functions.
- [ ] Inspect the full private multiplayer create/join/update/end helpers and exact roster status transitions.
- [x] Add deterministic rule tests for Tic-Tac-Toe, Connect Four, and Checkers; Chess uses server-side SAN-history replay and legal-move validation and still needs authenticated integration coverage.
- [ ] Build and run a dedicated two-account browser E2E environment.
- [ ] Decide Snake's trusted simulation runtime without adding Netlify or Cloudflare.


## Additional live helper inspection (2026-11-14)

- The shared multiplayer create helper takes an advisory transaction lock keyed by creator and game type, reuses that creator's active match of the same type, bounds settings and initial-state JSON sizes, validates invitation eligibility, inserts the host as joined, and invited users as invited. Its current generic contract is not yet a complete new-game validator: it accepts any syntactically valid game type and caller-provided initial state, so future game-type allowlisting and strict settings schemas belong in game-specific create wrappers.
- Shared multiplayer join locks the match row, validates invite/open-join policy, blocks, color uniqueness, and increments revision. The inspected helper does not enforce a generic max-player limit; individual game start functions (e.g. UNO/Ludo) must validate their own capacities. Do not assume generic join alone guarantees capacity.
- Shared multiplayer leave marks the caller left and completes the match when no joined players remain. It repairs the `is_it` marker for remaining players; it is Tag-oriented legacy behavior and should not be treated as a universal player lifecycle without review.
- Shared multiplayer end currently permits the creator or any joined player to end the match. Game-specific host-only end behavior (e.g. multiplayer Ludo) is stricter and should be preserved through the dedicated game action.
- Shared generic update-state helper accepts the complete client state after membership, active status, revision, object-shape, and 32 KB checks. It has no game-type allowlist, transition validator, or host/turn authority. New games must not call it.
- Legacy Ludo's server-side action function and multiplayer Ludo's action function are both server-computed and use row locks, but operate on different tables and player/color/turn models.
- UNO stores private hands and deck in a private state table and publishes only public top-card, turn, and card-count data in the shared match row. This confirms the intended private/public split for new hidden-information games.
- Tag movement checks maximum displacement per request but does not apply elapsed-time speed limits or a continuous server tick. It is unsuitable as a trusted Snake movement loop.


## Phase 1 addition — Snake Arena

- Persistence family: public.gather_multiplayer_games / public.gather_multiplayer_players, game_type='snake_arena', plus private.gather_snake_inputs. Snake does not use the legacy two-player gather_games table.
- Lobby lifecycle: gather_snake_create, gather_snake_join, gather_snake_decline, gather_snake_ready, gather_snake_set_settings, gather_snake_start, gather_snake_leave, gather_snake_end, and host-only gather_snake_rematch.
- Open lobby discovery: gather_snake_open_lobbies is a SECURITY DEFINER read RPC that returns open waiting rooms created by accepted friends, including full rooms so they remain watchable. The existing roster-table RLS policy remains unchanged.
- Read-only spectators: gather_snake_spectate admits an invitee or accepted friend of an open-lobby host into the shared roster with status spectating. That status does not count toward player capacity/readiness; only joined players get inputs, tick-driving, host controls, or temporary game chat. gather_snake_leave lets a spectator stop watching without changing match state.
- Action authority: clients call the JWT-verified gather-snake-action Edge Function with either a direction input or a request to advance one due tick. The function validates the Supabase user session and derives the caller identity itself.
- Private inputs: private.gather_snake_inputs stores one pending direction per joined player. RLS is enabled and all client roles have table access revoked. Direction write/snapshot/tick-commit RPCs are granted only to service_role.
- Authoritative rules: snake-engine.mjs calculates each movement step, body and wall collisions, simultaneous head collisions/swaps, obstacle collisions, food growth, score, round timeout, and winner. The client does not submit positions, scores, results or replacement state.
- Concurrency/timing: the database tick commit locks the game row, compares the current revision and original state, requires the server-controlled tick interval to have elapsed, increments the tick sequence, and stamps lastTickAt with the database clock. Concurrent stale tick submissions are rejected.
- Tick driver limitation: the MVP uses a host-browser tick driver with failover to another joined player's browser when the host has stopped advancing ticks. The trusted rule computation and commit are server-side, but the tick prompt itself is client-triggered. This is not a persistent dedicated simulation process; measure real latency before treating Snake as a high-scale competitive real-time game.
- Temporary chat: the private game chat list/send helpers now recognize snake_arena; existing game-chat cleanup trigger still removes temporary messages when the match is completed/cancelled.
- Frontend: snake.js and snake.css provide lobby settings, invite/open joining, readiness, fullscreen Canvas board, keyboard/touch direction controls, player scores, recap, rematch, and temporary chat. The Games hub, central notifications, Party Quick Play, app module lifecycle, and service-worker shell include Snake.
- Tests: deterministic engine tests are in tests/snake-engine.test.mjs; they cover tick timing, direction rules, growth, wall/obstacle/self/player/head-swap collisions, timeout scoring, and finished-state immutability. These are automated unit tests, not an authenticated multi-account browser test.
