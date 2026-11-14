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
| `games.js` | Chess | `gather_game_create`, `gather_game_accept`, `gather_game_move`, `gather_game_end` | Legacy turn-based |
| `games.js` | Checkers | `gather_game_create`, `gather_game_accept`, `gather_game_move`, `gather_game_end` | Legacy turn-based |
| `games.js` | Tic-Tac-Toe | `gather_game_create`, `gather_game_accept`, `gather_game_move`, `gather_game_end` | Legacy turn-based |
| `games.js` | Connect Four | `gather_game_create`, `gather_game_accept`, `gather_game_move`, `gather_game_end` | Legacy turn-based |
| `games.js` | Battleship | `gather_game_create`, `gather_game_battleship_private_state`, `gather_game_battleship_action` | Legacy game row + private fleet table |
| `games.js` | Legacy Ludo | `gather_game_create`, `gather_ludo_action` | Legacy turn-based |
| `games.js` | Legacy Ludo (alternate multiplayer module) | Client code contains `gather_ludo_multiplayer_action` path in multiplayer module; verify which UI path is mounted before changing | Shared multiplayer |
| `uno.js` | UNO lobby and match | `gather_uno_create/join/ready/start/get_state/action/leave/end/decline/done/request_rematch/respond_rematch`; reads shared game/player rows; Realtime subscriptions | Shared multiplayer + private UNO state |
| `ludo.js` | Standalone multiplayer Ludo | `gather_ludo_create/join/ready/start/multiplayer_action/leave/cancel/decline`; reads shared game/player rows; Realtime subscriptions | Shared multiplayer |
| `tag.js` | Tag lobby and round | `gather_tag_create/join/ready/set_mode/customize/start_round/return_lobby/leave/decline/finish_expired/move`; reads Tag lobby/player rows; Realtime subscriptions | Dedicated Tag |
| `game-chat.js` | Temporary in-game chat | `gather_game_chat_list`, `gather_game_chat_send` | Shared chat table + per-family authorization |
| `party.js` / `game-people-picker.js` | Party and invitation selection | Party-specific RPC/table access; must retain existing membership and eligibility checks | Party + invitation layer |

## Action authority and state ownership

### Legacy two-player games

- Chess, Checkers, Tic-Tac-Toe, and Connect Four compute the next board state in the browser and call `gather_game_move(game_id, expected_revision, state, next_turn_user_id, result)`.
- Live RPC checks authentication, conversation access, active status, turn ownership, revision equality, JSON object/size, next-player identity, and basic result constraints.
- It then persists the submitted state. It does **not** replay or validate each legal Chess/Checkers/Tic-Tac-Toe/Connect Four move, nor independently derive checkmate, win, or draw.
- The existing winner guard prevents a player from declaring the opponent the winner, but does not make the board transition authoritative.
- This is a confirmed trust boundary weakness. Do not use this generic RPC for any new game. Repair requires per-game server validators and coordinated client migration; do not make a blanket payload rejection.

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
- Public wrapper delegates to `private.gather_tag_move`. The private definition and all collision/tick semantics must be reviewed separately before reusing any of this for Snake.
- Tag's dedicated lobby schema and RPCs are not interchangeable with the generic multiplayer lifecycle.
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
- [ ] Add deterministic rule tests for the actual game-specific validators, not only the shared contract gate.
- [ ] Build and run a dedicated two-account browser E2E environment.
- [ ] Decide Snake's trusted simulation runtime without adding Netlify or Cloudflare.
