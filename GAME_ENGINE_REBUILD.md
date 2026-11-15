# Gather Game Engine Rebuild

Status: Core contracts and Phase 2 compatibility services implemented; game-client migration has not started  
Repository: \`Tuckticktuck/Gather-new\`  
Frontend hosting: GitHub Pages  
Backend: Supabase  
Scope: Shared architecture for every supported Gather game

## Purpose

Gather will use one shared game engine for the multiplayer experience while keeping each game's rules, private information, board/card rendering, and game-specific controls isolated in its own module.

The engine is responsible for the common platform:
- game registration and metadata;
- match and participant contracts;
- lobby and invitation lifecycle;
- permissions and player roles;
- canonical-state synchronization and recovery;
- shared chat, notifications, results, and rematch integration;
- consistent loading, error, and connection states.

A game module is responsible for its own rules, game state transitions, private data requirements, settings, and gameplay presentation. The browser may submit action intent, but trusted server-side code must validate that intent and calculate the canonical state.

## Current playable catalog

The initial registry includes:
- Chess
- Checkers
- Tic-Tac-Toe
- Connect Four
- Battleship
- Ludo
- UNO
- Dominoes

Snake Arena and Tag Arena are retired from the current playable client. Their historical database objects and source history are not to be removed as part of this rebuild.

## Architecture

\`\`\`
Gather UI
  ├─ Games Hub
  ├─ Conversation Quick Play
  ├─ Invitations / Notifications
  └─ Live Games / History
         |
Shared Game Engine
  ├─ Game Registry
  ├─ Match Contract
  ├─ Lobby & Participant Services
  ├─ Match Lifecycle
  ├─ Match Synchronization
  ├─ Permission / Role Helpers
  ├─ Game Chat Integration
  └─ Results / Rematch Integration
         |
Independent Game Modules
  ├─ Chess
  ├─ Checkers
  ├─ Tic-Tac-Toe
  ├─ Connect Four
  ├─ Battleship
  ├─ Ludo
  ├─ UNO
  └─ Dominoes
         |
Supabase
  ├─ Postgres / RLS
  ├─ Game-specific RPCs
  ├─ Edge Functions where appropriate
  ├─ Private per-player game data
  └─ Realtime invalidation / notifications
\`\`\`

## Core invariants

1. The server is authoritative for all accepted game actions and outcomes.
2. Realtime payloads are notifications, not trusted state transitions.
3. Clients reload canonical state after a notification, reconnect, or uncertain action result.
4. Every mutation is authenticated and authorized server-side using the authenticated caller identity.
5. Every state-changing action is protected against concurrent/stale writes using a row lock, revision check, or an equivalent atomic mechanism.
6. Duplicate action delivery must not create duplicate moves, draws, penalties, invitations, or results. The final action API must use server-enforced idempotency keys or a game-specific equivalent.
7. Shared match data contains only information safe for every reader permitted by current RLS.
8. Hidden hands, fleets, decks, secret words, and other private data are returned only through narrowly authorized server paths.
9. Spectators are read-only and do not receive private player state.
10. Match completion is terminal; a rematch creates a fresh match and fresh private state.
11. A game registry entry is metadata, not permission to invoke arbitrary database functions.
12. UI permission helpers are presentation aids only; they never replace database/RPC authorization.

## Core code introduced

### \`games/core/game-registry.mjs\`

- Validates game IDs, names, categories, interaction models, and player bounds.
- Exposes an immutable registry and model-based catalog lookup.
- Registers the eight currently playable game types.

### \`games/core/match-contract.mjs\`

- Normalizes the existing database game + player roster shape into a shared read model.
- Exposes viewer-role derivation for host, player, invitee, spectator, and visitor.
- Exposes UI affordance checks for common lifecycle commands.
- Retains the existing deterministic authorization and public-state size checks.
- Explicitly documents that client helpers are not security boundaries.

### \`games/core/match-sync.mjs\`

- Subscribes to change notifications and coalesces bursts.
- Loads canonical snapshots from an injected data adapter.
- Rejects older revisions.
- Handles errors without breaking the subscriber.
- Cancels timers and releases subscriptions when stopped.
- Protects against stale in-flight loads crossing a stop/restart boundary.

### Compatibility

\`games/shared/match-contract.mjs\` re-exports the established helpers from the new core so existing contract tests and in-progress work do not break.

### `games/core/action-dispatcher.mjs`

- Serializes this browser's mutation requests per match.
- Reads the latest canonical revision immediately before dispatch.
- Sends a standard intent envelope containing match ID, action, payload, expected revision, and request ID.
- Accepts a caller-supplied request ID so a retry can reuse the same idempotency key after an uncertain network result.
- Does not claim that local queuing is a substitute for server-side idempotency or atomic revision checks.

### `games/core/game-module-contract.mjs`

- Defines the minimum interface for independently mounted game modules.
- Requires mount, lobby rendering, match rendering, and unmount hooks.
- Validates that each module maps to a registered game.
- Keeps shared services injected rather than allowing modules to own their own lobby, invitation, and synchronization systems.

### `games/core/supabase-adapters.mjs`

- Reads canonical snapshots from the existing `gather_games` and `gather_multiplayer_games` persistence families.
- Normalizes the legacy two-player row into the shared match/roster contract.
- Subscribes to match/roster changes and emits invalidation callbacks; it never trusts Realtime payload state.
- Maps the existing Chess, Checkers, Tic-Tac-Toe, Connect Four, Battleship, UNO, Ludo, and Dominoes lifecycle RPCs into per-game drivers.
- Does not expose `gather_multiplayer_update_state` or any generic client-authored full-state update operation.
- Keeps private hands and game-specific secret data behind the existing private-state RPCs.

### `games/core/lobby-service.mjs`

- Provides a shared facade for create, join, decline, ready, start, leave, cancel, end, spectate, load, and watch operations.
- Validates game registration, player bounds, invitation lists, and Dominoes team settings before calling a driver.
- Applies UI-level role checks for host, joined player, invitee, and spectator actions.
- Delegates the actual authorization and state transition to the existing server-side RPC for each game.
- Refreshes canonical snapshots after successful mutations without converting a successful mutation into a failure if the follow-up read is temporarily unavailable.

### Current persistence/RPC boundaries

| Games | Existing persistence path | Driver behavior |
|---|---|---|
| Chess, Checkers, Tic-Tac-Toe, Connect Four, Battleship | `gather_games` | Create invitation, accept, decline, cancel pending invite, end active match |
| UNO | `gather_multiplayer_games` + private UNO state | Dedicated create/join/ready/start/leave/end/spectate/get-state RPCs |
| Ludo | `gather_multiplayer_games` | Dedicated create/join/decline/ready/start/leave/cancel RPCs |
| Dominoes | `gather_multiplayer_games` + private hands/boneyard tables | Dedicated create/join/decline/ready/start/leave/end/spectate/get-state RPCs |

The game-specific server functions remain authoritative. These adapters are compatibility boundaries, not replacements for database authorization. In particular, `gather_multiplayer_update_state` remains intentionally unused because it accepts client-supplied full state.

## Proposed target directory layout

\`\`\`
games/
  core/
    index.mjs
    game-registry.mjs
    match-contract.mjs
    match-sync.mjs
    lobby-service.mjs             # shared lifecycle facade
    supabase-adapters.mjs         # existing RPC/storage compatibility
    action-dispatcher.mjs         # ordered intent dispatch
    game-module-contract.mjs      # versioned game module interface
  shared/
    match-contract.mjs            # backward-compatible exports during migration
  modules/
    chess/
    checkers/
    tic-tac-toe/
    connect-four/
    battleship/
    ludo/
    uno/
    dominoes/
\`\`\`

The repository currently uses a lightweight static JavaScript/PWA architecture. The rebuild will preserve that approach; a framework migration is not required.

## Canonical lifecycle

1. Create a lobby. The creator becomes the host and first joined participant.
2. Invite or discover eligible people. Invitation creation is idempotent.
3. Join atomically. The server checks membership, blocks, invitation policy, capacity, and seat/color constraints.
4. Set readiness. A joined player may change only their own ready state.
5. Start. The host starts only when the game-specific roster and settings requirements pass.
6. Play. Joined players submit typed action intent; trusted server rules validate and commit the action.
7. Observe. Spectators receive only public state and cannot mutate the match.
8. Reconnect. Clients fetch canonical state and resume from the accepted revision.
9. Finish. The server calculates the outcome and closes the match.
10. Rematch. A new match starts with fresh state, timers, scores, and private data.

The existing \`status = active\` value currently covers both lobby and in-progress rows in parts of Gather. The shared contract must therefore interpret game-specific phases rather than treating that database status as proof the match has started.

## Migration strategy

Migration is incremental, not a destructive rewrite.

1. Complete source, RPC, and schema dependency inventory.
2. Stabilize the core contracts and tests without routing existing games through them.
3. Add adapter interfaces for the existing persistence families.
4. Prove the engine with Tic-Tac-Toe and Connect Four.
5. Migrate Dominoes as the complex multiplayer pilot.
6. Migrate UNO, multiplayer Ludo, Battleship, Chess, and Checkers.
7. Reconcile and remove obsolete pathways only after all callers and stored data have been verified.
8. Run full multi-account and device regression tests before release.

No production rows, game history, or existing database tables should be deleted as part of the initial foundation work.

## Database safety and migration-history constraints

The current audit reports historical migration drift: 154 applied migration records, 117 migration files in the repository, 43 applied names without same-named source files, and six repository migrations without a same-name applied record. Therefore:
- do not reset the production project;
- do not replay guessed or reconstructed migration SQL;
- do not rewrite migration history to make filenames line up;
- inspect current live function definitions, grants, RLS, table structure, and publication membership before each schema change;
- create and review additive migrations only after a trusted baseline is available.

## Migration order

| Stage | First target | Purpose |
|---|---|---|
| 0 | Full source / database inventory | Document callers and compatibility boundaries |
| 1 | Core contracts and services | Stable reusable foundation |
| 2 | Tic-Tac-Toe + Connect Four | Prove basic two-player lifecycle |
| 3 | Dominoes | Prove multiple players, private hands, board growth, drawing, and rounds |
| 4 | UNO | Prove private card state and complex action rules |
| 5 | Ludo | Prove multi-player turn progression |
| 6 | Battleship | Prove private boards and targeting |
| 7 | Chess + Checkers | Prove advanced board-rule integration |
| 8 | Deprecate legacy paths | Only after dependency and regression gates pass |
| 9 | Release hardening | Multi-account, reconnect, privacy, and device validation |

## Testing strategy

Automated tests must cover:
- registry validation and uniqueness;
- snapshot normalization and schema compatibility;
- roles and command affordances;
- lifecycle state transitions;
- stale revisions and duplicate action delivery;
- reconnect and out-of-order network responses;
- rules for every individual game;
- private-state access boundaries;
- lobby invitation, decline, leave, capacity, and host departure;
- rematch isolation and cleanup.

A separate authenticated browser suite must exercise at least two player accounts and an observer account in a dedicated test environment. Unit tests and static CI cannot substitute for that release gate.

## Current implementation status

### Completed in this foundation increment
- [x] Added immutable game registry for current playable games.
- [x] Added canonical match snapshot and player-role contract.
- [x] Added shared UI affordance checks for lifecycle operations.
- [x] Added realtime invalidation / canonical snapshot coordinator.
- [x] Added ordered, revision-aware action dispatcher with stable request-ID support.
- [x] Added versioned game-module adapter contract and registry.
- [x] Added backward-compatible exports for previous match-contract imports.
- [x] Added registry, contract, and synchronization test files.

### Not yet completed
- [ ] Lobby service adapter and lifecycle facade.
- [ ] Standard game-module interface.
- [ ] Action dispatcher with request idempotency contract.
- [ ] Persistence adapters for legacy two-player and shared multiplayer tables.
- [ ] Authenticated two-account integration environment.
- [ ] Migration of any existing game client.
- [ ] Database schema changes or production RPC replacement.

## Immediate next work

1. Finish the core service interfaces and test them with fake adapters.
2. Add compatibility adapters for the current \`gather_games\` and \`gather_multiplayer_games\` persistence families without changing their live behavior.
3. Wire the new core into Tic-Tac-Toe and Connect Four behind a controlled migration path.
4. Run automated tests and a dedicated authenticated multi-account regression before enabling the first migrated game.


## Phase 4 — Dominoes module adapter

Added `games/modules/dominoes/index.mjs` as the first complex multiplayer game-module adapter.

- The module is registered against the shared game registry and implements the versioned game-module hooks.
- Lobby creation, join, decline, readiness, start, leave, end, spectate, and canonical public snapshots are routed through the shared lobby service.
- Per-match Realtime watching uses the shared match-sync service and disposes its subscription on unmount.
- Dominoes private state is fetched separately through `gather_dominoes_get_state`; the public match snapshot is never augmented with private hands in database storage.
- The existing game-specific RPCs remain authoritative. No generic client-authored full-state update was introduced.
- Added `tests/dominoes-module.test.mjs` for module registration, private-state separation, shared lobby creation, and watcher cleanup.

**Migration boundary:** this commit adds and tests the Dominoes module adapter, but the existing `dominoes.js` screen still owns its current UI and direct lifecycle call sites. The next cutover step is to inject this module into that screen and remove its duplicate lobby/realtime lifecycle code. The live gameplay UI is intentionally unchanged until that integration is verified end-to-end.
